import http.server
import http.client
import base64
import ctypes
from ctypes import wintypes
import json
import os
import re
import secrets as _secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse

UPSTREAM_HOST = os.environ.get("OPENCODE_HOST", "127.0.0.1")
UPSTREAM_PORT = int(os.environ.get("OPENCODE_PORT", "4096"))
LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = int(os.environ.get("FRONT_PORT", "8000"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SECRETS_DIR = os.path.join(os.path.expanduser("~"), ".config", "opencode-chat")
SECRETS_FILE = os.path.join(SECRETS_DIR, "secrets.json")
PROFILE_FILE = os.path.join(SECRETS_DIR, "profile.json")
AUTH_FILE = os.path.join(os.path.expanduser("~"), ".local", "share", "opencode", "auth.json")
ALLOWED_ORIGINS = {
    "http://127.0.0.1:%d" % LISTEN_PORT,
    "http://localhost:%d" % LISTEN_PORT,
}
SESSION_TOKEN = _secrets.token_urlsafe(32)

PROXY_DRYRUN = os.environ.get("OC_PROXY_DRYRUN", "").strip().lower() in ("1", "true", "yes")
PROXY_ALLOW_EXACT = {"/config/providers", "/experimental/tool/ids", "/file", "/path", "/agent", "/event"}
PROXY_ALLOW_PREFIX = ("/session", "/provider", "/question")

LOG_FILE = os.environ.get("OC_LOG_FILE", "").strip()
LOG_LOCK = threading.Lock()
if LOG_FILE:
    try:
        os.makedirs(os.path.dirname(os.path.abspath(LOG_FILE)), exist_ok=True)
    except Exception:
        pass


def write_log(text):
    try:
        sys.stderr.write(text)
    except Exception:
        pass
    if not LOG_FILE:
        return
    try:
        with LOG_LOCK:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write("%s %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), text))
    except Exception:
        pass


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data, protect):
    buf = ctypes.create_string_buffer(data, len(data))
    blob_in = DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    blob_out = DATA_BLOB()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise OSError("DPAPI failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def dpapi_encrypt(text):
    return base64.b64encode(_dpapi(text.encode("utf-8"), True)).decode("ascii")


def dpapi_decrypt(b64):
    return _dpapi(base64.b64decode(b64), False).decode("utf-8")


def load_secrets():
    try:
        with open(SECRETS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_secrets(data):
    os.makedirs(SECRETS_DIR, exist_ok=True)
    tmp = SECRETS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, SECRETS_FILE)
    try:
        os.chmod(SECRETS_FILE, 0o600)
    except Exception:
        pass


def plain_providers():
    try:
        with open(AUTH_FILE, "r", encoding="utf-8") as f:
            auth = json.load(f)
        return sorted(k for k, v in auth.items() if isinstance(v, dict) and v.get("key"))
    except Exception:
        return []


def secret_base_urls():
    out = {}
    for provider, entry in load_secrets().items():
        if isinstance(entry, dict) and entry.get("baseURL"):
            out[provider] = entry["baseURL"]
    return out


def secret_models():
    out = {}
    for provider, entry in load_secrets().items():
        if isinstance(entry, dict) and isinstance(entry.get("models"), list):
            out[provider] = entry["models"]
    return out

PREVIEW_BACKBAR = """<div id="__oc_backbar" style="position:fixed;left:14px;bottom:14px;z-index:2147483647;font:13px/1.4 system-ui,'Segoe UI','Microsoft YaHei',sans-serif"><a href="/" style="display:inline-flex;align-items:center;gap:6px;padding:8px 13px;border-radius:10px;background:#10a37f;color:#fff;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.25)">&larr; 返回应用</a></div><script>document.addEventListener("keydown",function(e){if(e.key==="Escape"){location.href="/";}});</script>"""


def redact_secrets(value):
    if isinstance(value, dict):
        for k, v in list(value.items()):
            if k == "apiKey" and isinstance(v, str):
                value[k] = "***"
            elif k == "key" and isinstance(v, str) and len(v) >= 16:
                value[k] = "***"
            else:
                redact_secrets(v)
    elif isinstance(value, list):
        for item in value:
            redact_secrets(item)


def inject_preview_backbar(data, rel, nonce):
    if b"__oc_backbar" in data:
        return data
    snippet = PREVIEW_BACKBAR.replace("<script>", '<script nonce="%s">' % nonce)
    try:
        text = data.decode("utf-8")
    except Exception:
        return data
    m = re.search(r"<body[^>]*>", text, re.IGNORECASE) or re.search(r"<head[^>]*>", text, re.IGNORECASE)
    if m:
        i = m.end()
        text = text[:i] + snippet + text[i:]
    else:
        text = snippet + text
    return text.encode("utf-8")


HOP_HEADERS = {
    "host", "content-length", "connection", "accept-encoding",
    "keep-alive", "transfer-encoding", "upgrade", "proxy-connection",
}

SECURITY_HEADERS = (
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
)
CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; "
    "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
)

OPENCODE_PORT = UPSTREAM_PORT
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def find_opencode_exe():
    env_exe = os.environ.get("OC_OPENCODE_EXE", "").strip()
    candidates = []
    if env_exe:
        candidates.append(env_exe)
    candidates.append(os.path.join(os.path.dirname(BASE_DIR), "runtime", "opencode", "opencode.exe"))
    appdata = os.environ.get("APPDATA", "")
    local = os.environ.get("LOCALAPPDATA", "")
    if appdata:
        candidates.append(os.path.join(appdata, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"))
        candidates.append(os.path.join(appdata, "npm", "opencode.exe"))
    if local:
        candidates.append(os.path.join(local, "opencode", "opencode.exe"))
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return shutil.which("opencode")


def port_open(port, host="127.0.0.1", timeout=0.4):
    import socket
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect((host, port))
        return True
    except Exception:
        return False
    finally:
        try:
            s.close()
        except Exception:
            pass


def port_owner_pid(port):
    if os.name != "nt":
        return None
    try:
        out = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            creationflags=CREATE_NO_WINDOW, capture_output=True, text=True, timeout=15,
        ).stdout or ""
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING":
                addr = parts[1]
                if addr.endswith(":" + str(port)) and (
                    addr.startswith("127.0.0.1") or addr.startswith("0.0.0.0")
                ):
                    try:
                        return int(parts[4])
                    except ValueError:
                        return None
    except Exception:
        write_log("port_owner_pid error\n")
    return None


def pid_image_name(pid):
    if os.name != "nt":
        return ""
    try:
        out = subprocess.run(
            ["tasklist", "/FI", "PID eq %d" % int(pid), "/FO", "CSV", "/NH"],
            creationflags=CREATE_NO_WINDOW, capture_output=True, text=True, timeout=15,
        ).stdout or ""
        if out.startswith('"'):
            return out.split('"')[1]
    except Exception:
        pass
    return ""


def node_tls_env():
    """为 opencode（Node/Bun）补齐系统根证书，兼容杀软 HTTPS 扫描。

    部分杀毒软件会做 TLS 中间人重签，Node/Bun 自带的 CA 库不信任其根证书，
    导致模型调用报「unknown certificate verification error」。启动器会把系统
    根证书导出到 node-extra-ca.pem，这里通过 NODE_EXTRA_CA_CERTS 传给 opencode。
    """
    env = dict(os.environ)
    if not env.get("NODE_EXTRA_CA_CERTS"):
        pem = os.path.join(SECRETS_DIR, "node-extra-ca.pem")
        if os.path.isfile(pem):
            env["NODE_EXTRA_CA_CERTS"] = pem
    return env


def restart_opencode():
    """结束并重启 opencode serve，使插件重新读取 secrets.json（DPAPI 密钥）。"""
    exe = find_opencode_exe()
    if not exe:
        return {"ok": False, "error": "未找到 opencode 可执行文件"}
    killed = False
    pid = port_owner_pid(OPENCODE_PORT)
    if pid and "opencode" in pid_image_name(pid).lower():
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                creationflags=CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
            killed = True
        except Exception:
            pass
    for _ in range(40):
        if not port_open(OPENCODE_PORT):
            break
        time.sleep(0.25)
    args = [exe, "serve", "--port", str(OPENCODE_PORT), "--hostname", "127.0.0.1"]
    if exe.lower().endswith((".cmd", ".bat")):
        args = ["cmd", "/c"] + args
    try:
        os.makedirs(SECRETS_DIR, exist_ok=True)
        subprocess.Popen(
            args, cwd=SECRETS_DIR, env=node_tls_env(),
            creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        return {"ok": False, "error": "启动 opencode 失败: %s" % e, "exe": exe, "killed": killed}
    for _ in range(100):
        if port_open(OPENCODE_PORT):
            break
        time.sleep(0.3)
    if not port_open(OPENCODE_PORT):
        return {"ok": False, "error": "等待 opencode 就绪超时", "exe": exe, "killed": killed}
    return {"ok": True, "exe": exe, "killed": killed, "port": OPENCODE_PORT}



class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        msg = re.sub(r"token=[^&\s\"']+", "token=***", fmt % args)
        write_log("%s - [%s] %s\n" % (self.address_string(), self.command, msg))

    def do_GET(self):
        self._route()

    def do_POST(self):
        self._route()

    def do_PUT(self):
        self._route()

    def do_PATCH(self):
        self._route()

    def do_DELETE(self):
        self._route()

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_error(403, "origin blocked")
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-OC-Token")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _guard(self, parsed):
        sfs = (self.headers.get("Sec-Fetch-Site") or "").lower()
        if sfs and sfs not in ("same-origin", "none"):
            self.send_error(403, "cross-site blocked")
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_error(403, "origin blocked")
            return False
        token = self.headers.get("X-OC-Token")
        if not token:
            qs = urllib.parse.parse_qs(parsed.query)
            token = (qs.get("token") or [""])[0]
        if not token:
            cookie = self.headers.get("Cookie") or ""
            m = re.search(r"(?:^|;\s*)oc_token=([^;]+)", cookie)
            if m:
                token = urllib.parse.unquote(m.group(1))
        if token != SESSION_TOKEN:
            self.send_error(403, "invalid token")
            return False
        return True

    def _read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        return self.rfile.read(int(length))

    def _route(self):
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/api/_version":
            self._version()
            return
        if parsed.path == "/api" or parsed.path.startswith("/api/"):
            if not self._guard(parsed):
                return
        if parsed.path == "/api/_mkdir":
            self._mkdir()
        elif parsed.path == "/api/_secret":
            self._secret(parsed)
        elif parsed.path == "/api/_secret/purge":
            self._secret_purge()
        elif parsed.path == "/api/_profile":
            self._profile()
        elif parsed.path == "/api/_opencode/restart":
            self._opencode_restart()
        elif parsed.path == "/api/_opencode/status":
            self._opencode_status()
        elif parsed.path == "/api" or parsed.path.startswith("/api/"):
            self._proxy(parsed)
        else:
            self._static(parsed.path)

    def _json(self, obj, status=200):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _secret(self, parsed):
        try:
            if self.command == "GET":
                pass
            elif self.command == "POST":
                req = json.loads(self._read_body().decode("utf-8") or "{}")
                provider = (req.get("provider") or "").strip()
                key = req.get("key") or ""
                base_url = (req.get("baseURL") or "").strip()
                if not provider:
                    raise ValueError("provider is required")
                data = load_secrets()
                prev = data.get(provider)
                if key:
                    enc = dpapi_encrypt(key)
                elif isinstance(prev, dict):
                    enc = prev.get("key")
                elif isinstance(prev, str):
                    enc = prev
                else:
                    enc = None
                if not enc:
                    raise ValueError("key is required for a new provider")
                raw_models = req.get("models")
                if isinstance(raw_models, str):
                    raw_models = raw_models.splitlines()
                if not isinstance(raw_models, list):
                    raw_models = []
                models = []
                for m in raw_models:
                    s = str(m).strip()
                    if s and s not in models:
                        models.append(s)
                entry = {"key": enc}
                if base_url:
                    entry["baseURL"] = base_url
                if models:
                    entry["models"] = models
                data[provider] = entry
                save_secrets(data)
            elif self.command == "DELETE":
                qs = urllib.parse.parse_qs(parsed.query)
                provider = (qs.get("provider") or [""])[0].strip()
                data = load_secrets()
                data.pop(provider, None)
                save_secrets(data)
            else:
                self.send_error(405, "method not allowed")
                return
        except Exception as e:
            self.send_error(400, "secret error: %s" % e)
            return
        self._json({"ok": True, "providers": sorted(load_secrets().keys()), "plain": plain_providers(), "baseURL": secret_base_urls(), "models": secret_models()})

    def _secret_purge(self):
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
            provider = (req.get("provider") or "").strip()
            if not provider:
                raise ValueError("provider is required")
            removed = False
            if os.path.isfile(AUTH_FILE):
                with open(AUTH_FILE, "r", encoding="utf-8") as f:
                    auth = json.load(f)
                if isinstance(auth, dict) and provider in auth:
                    with open(AUTH_FILE + ".bak", "w", encoding="utf-8") as f:
                        json.dump(auth, f, indent=2)
                    auth.pop(provider, None)
                    with open(AUTH_FILE, "w", encoding="utf-8") as f:
                        json.dump(auth, f, indent=2)
                    removed = True
        except Exception as e:
            self.send_error(400, "purge error: %s" % e)
            return
        self._json({"ok": True, "removed": removed})

    def _profile(self):
        try:
            if self.command == "GET":
                data = {}
                if os.path.isfile(PROFILE_FILE):
                    with open(PROFILE_FILE, "r", encoding="utf-8") as f:
                        loaded = json.load(f)
                    if isinstance(loaded, dict):
                        data = loaded
                self._json({"ok": True, "data": data})
                return
            if self.command == "POST":
                req = json.loads(self._read_body().decode("utf-8") or "{}")
                data = req.get("data")
                if not isinstance(data, dict):
                    raise ValueError("data must be an object")
                os.makedirs(SECRETS_DIR, exist_ok=True)
                tmp = PROFILE_FILE + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False)
                os.replace(tmp, PROFILE_FILE)
                self._json({"ok": True, "keys": len(data)})
                return
            self.send_error(405, "method not allowed")
        except Exception as e:
            self.send_error(400, "profile error: %s" % e)

    def _version(self):
        ver = ""
        try:
            with open(os.path.join(BASE_DIR, "VERSION"), "r", encoding="utf-8") as f:
                ver = f.read().strip()
        except Exception:
            pass
        self._json({"ok": True, "version": ver, "pid": os.getpid()})

    def _opencode_restart(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        result = restart_opencode()
        self._json(result, 200 if result.get("ok") else 500)

    def _opencode_status(self):
        data = {}
        try:
            with open(os.path.join(SECRETS_DIR, "opencode-install.json"), "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            data = {}
        ready = port_open(UPSTREAM_PORT)
        data["upstream_ready"] = ready
        data["installed"] = True if ready else bool(find_opencode_exe())
        self._json({"ok": True, "status": data})

    def _mkdir(self):
        try:
            raw = self._read_body()
            req = json.loads(raw.decode("utf-8") or "{}")
            path = (req.get("path") or "").strip()
            if not path:
                raise ValueError("path is required")
            path = os.path.abspath(os.path.expanduser(path))
            os.makedirs(path, exist_ok=True)
        except Exception as e:
            self.send_error(400, "mkdir error: %s" % e)
            return
        data = json.dumps({"ok": True, "path": path}).encode("utf-8")
        self.send_response(200)
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _proxy_allowed(self, path):
        if path in PROXY_ALLOW_EXACT:
            return True
        for p in PROXY_ALLOW_PREFIX:
            if path == p or path.startswith(p + "/"):
                return True
        return False

    def _proxy(self, parsed):
        upstream_path = parsed.path
        if upstream_path == "/api":
            upstream_path = "/"
        else:
            upstream_path = upstream_path[len("/api"):]
        base = upstream_path.split("?", 1)[0]
        if not self._proxy_allowed(base):
            sys.stderr.write("[proxy] blocked %s %s\n" % (self.command, base))
            if not PROXY_DRYRUN:
                self.send_error(404)
                return
        if parsed.query:
            upstream_path += "?" + parsed.query

        body = self._read_body()
        headers = {k: v for k, v in self.headers.items() if k.lower() not in HOP_HEADERS}
        if body:
            headers["Content-Length"] = str(len(body))

        try:
            conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=300)
            conn.request(self.command, upstream_path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            self.send_error(502, "upstream error: %s" % e)
            return

        ctype = resp.getheader("Content-Type", "")
        is_sse = ctype.startswith("text/event-stream")

        self.send_response(resp.status)
        for k, v in resp.getheaders():
            if k.lower() in HOP_HEADERS or k.lower() == "content-length":
                continue
            self.send_header(k, v)

        if is_sse:
            self.send_header("Transfer-Encoding", "chunked")
            self.end_headers()
            try:
                while True:
                    chunk = resp.read1(4096)
                    if not chunk:
                        break
                    self._write_chunk(chunk)
                self._write_chunk(b"")
            except Exception:
                pass
            finally:
                try:
                    conn.close()
                except Exception:
                    pass
        else:
            data = resp.read()
            if "json" in (ctype or "").lower() and (
                upstream_path.startswith("/provider") or upstream_path.startswith("/config")
            ):
                try:
                    obj = json.loads(data.decode("utf-8"))
                    redact_secrets(obj)
                    data = json.dumps(obj).encode("utf-8")
                except Exception:
                    pass
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if data:
                self.wfile.write(data)
            conn.close()

    def _write_chunk(self, chunk):
        if chunk:
            self.wfile.write(("%x\r\n" % len(chunk)).encode() + chunk + b"\r\n")
        else:
            self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def _static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        rel = path.lstrip("/")
        filepath = os.path.normpath(os.path.join(STATIC_DIR, rel))
        root = os.path.normcase(STATIC_DIR)
        candidate = os.path.normcase(filepath)
        if not (candidate == root or candidate.startswith(root + os.sep)) or not os.path.isfile(filepath):
            self.send_error(404)
            return
        ext = os.path.splitext(filepath)[1].lower()
        ctype = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".ico": "image/x-icon",
            ".json": "application/json",
            ".webmanifest": "application/manifest+json",
            ".woff2": "font/woff2",
            ".woff": "font/woff",
            ".ttf": "font/ttf",
            ".otf": "font/otf",
        }.get(ext, "application/octet-stream")
        with open(filepath, "rb") as f:
            data = f.read()
        csp = CSP
        if ext == ".html" and rel != "index.html":
            nonce = _secrets.token_urlsafe(16)
            data = inject_preview_backbar(data, rel, nonce)
            csp = CSP.replace("script-src 'self'", "script-src 'self' 'nonce-%s'" % nonce)
        self.send_response(200)
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        if ext == ".html":
            self.send_header("Content-Security-Policy", csp)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        if ext == ".html" and rel == "index.html":
            self.send_header("Set-Cookie", "oc_token=%s; HttpOnly; SameSite=Strict; Path=/" % SESSION_TOKEN)
        self.send_header("Content-Length", str(len(data)))
        if ext in (".html", ".js", ".css"):
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        write_log("server error: %r\n" % (exc,))
        super().handle_error(request, client_address)


def main():
    server = Server((LISTEN_HOST, LISTEN_PORT), Handler)
    write_log("proxy on http://%s:%d -> http://%s:%d%s\n" % (
        LISTEN_HOST, LISTEN_PORT, UPSTREAM_HOST, UPSTREAM_PORT,
        ("  (log: %s)" % LOG_FILE) if LOG_FILE else "",
    ))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
