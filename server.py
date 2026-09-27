import http.server
import http.client
import base64
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
import platform
import re
import secrets as _secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile

UPSTREAM_HOST = os.environ.get("OPENCODE_HOST", "127.0.0.1")
UPSTREAM_PORT = int(os.environ.get("OPENCODE_PORT", "4096"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SECRETS_DIR = os.path.join(os.path.expanduser("~"), ".config", "opencode-chat")
SECRETS_FILE = os.path.join(SECRETS_DIR, "secrets.json")
PROFILE_FILE = os.path.join(SECRETS_DIR, "profile.json")
REMOTE_FILE = os.path.join(SECRETS_DIR, "remote.json")
SERVER_FILE = os.path.join(SECRETS_DIR, "server.json")
ACTIVE_FILE = os.path.join(SECRETS_DIR, "server-active.json")
RESTART_LOG = os.path.join(SECRETS_DIR, "restart.log")
LOCAL_FILE = os.path.join(SECRETS_DIR, "local-llm.json")
LLAMA_STATUS_FILE = os.path.join(SECRETS_DIR, "llama-install.json")
LLAMA_LOG_FILE = os.path.join(SECRETS_DIR, "logs", "llama.log")
AUTH_FILE = os.path.join(os.path.expanduser("~"), ".local", "share", "opencode", "auth.json")
SESSION_TOKEN = _secrets.token_urlsafe(32)
REMOTE_SESSIONS = set()
REMOTE_LOCK = threading.Lock()
PBKDF2_ROUNDS = 120000
# 同一 prompt_async 请求被浏览器/输入法在极短时间内重复提交时的去重（防重复发言）
PROMPT_DEDUP = {}
PROMPT_DEDUP_LOCK = threading.Lock()
PROMPT_DEDUP_WINDOW = 1.0


def _load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, path)


def load_remote():
    return _load_json(REMOTE_FILE)


def save_remote(data):
    _save_json(REMOTE_FILE, data)


def load_server_conf():
    return _load_json(SERVER_FILE)


def save_server_conf(data):
    _save_json(SERVER_FILE, data)


def front_port():
    env = os.environ.get("FRONT_PORT", "").strip()
    if env:
        try:
            return int(env)
        except ValueError:
            pass
    try:
        p = int(load_server_conf().get("port") or 0)
        if 1 <= p <= 65535:
            return p
    except Exception:
        pass
    return 8000


LISTEN_PORT = front_port()


def hash_password(pw):
    salt = _secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", str(pw).encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2$%s$%s" % (
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(dk).decode("ascii"),
    )


def verify_password(pw, stored):
    try:
        algo, salt_b64, hash_b64 = str(stored).split("$")
        if algo != "pbkdf2":
            return False
        salt = base64.b64decode(salt_b64)
        want = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", str(pw).encode("utf-8"), salt, PBKDF2_ROUNDS)
        return _secrets.compare_digest(dk, want)
    except Exception:
        return False


def remote_enabled():
    cfg = load_remote()
    return bool(cfg.get("enabled")) and bool(cfg.get("password"))


def lan_host():
    if remote_enabled():
        return "0.0.0.0"
    if os.environ.get("OC_LAN", "").strip().lower() in ("1", "true", "yes"):
        return "0.0.0.0"
    return "127.0.0.1"


def lan_addresses(port):
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip and not ip.startswith("127."):
                ips.add(ip)
    except Exception:
        pass
    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ips.add(s.getsockname()[0])
            s.close()
        except Exception:
            pass
    return sorted("http://%s:%d" % (ip, port) for ip in ips)


def port_in_use(port):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", int(port)))
        return False
    except OSError:
        return True
    finally:
        try:
            s.close()
        except Exception:
            pass


def write_active(port, host):
    try:
        _save_json(ACTIVE_FILE, {"pid": os.getpid(), "port": int(port), "host": host})
    except Exception:
        pass


PROXY_DRYRUN = os.environ.get("OC_PROXY_DRYRUN", "").strip().lower() in ("1", "true", "yes")
PROXY_ALLOW_EXACT = {"/config/providers", "/experimental/tool/ids", "/file", "/file/content", "/path", "/agent", "/event"}
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


def ensure_ca_pem(force=False):
    """导出 Windows 受信任根证书（ROOT/CA）为 PEM。

    部分杀毒软件（如 Kaspersky）的「HTTPS 扫描」会用自有根证书做中间人重签；
    Windows 信任它，但 opencode 使用的 Node/Bun 运行时只信任自带 CA 库，
    导致模型调用报「unknown certificate verification error」。把系统根证书
    通过 NODE_EXTRA_CA_CERTS 传给 opencode 即可。
    """
    pem = os.path.join(SECRETS_DIR, "node-extra-ca.pem")
    try:
        if not force and os.path.isfile(pem) and (time.time() - os.path.getmtime(pem) < 7 * 86400):
            return pem
    except Exception:
        pass
    try:
        import ssl
        pems = []
        for store in ("ROOT", "CA"):
            try:
                for der, enc, _trust in ssl.enum_certificates(store):
                    if enc != "x509_asn":
                        continue
                    b64 = base64.b64encode(der).decode("ascii")
                    lines = [b64[i:i + 64] for i in range(0, len(b64), 64)]
                    pems.append("-----BEGIN CERTIFICATE-----\n" + "\n".join(lines) + "\n-----END CERTIFICATE-----\n")
            except Exception:
                continue
        if not pems:
            return pem if os.path.isfile(pem) else ""
        os.makedirs(SECRETS_DIR, exist_ok=True)
        tmp = pem + ".tmp"
        with open(tmp, "w", encoding="ascii") as f:
            f.write("".join(pems))
        os.replace(tmp, pem)
        return pem
    except Exception:
        return pem if os.path.isfile(pem) else ""


def node_tls_env():
    env = dict(os.environ)
    if not env.get("NODE_EXTRA_CA_CERTS"):
        pem = ensure_ca_pem()
        if pem:
            env["NODE_EXTRA_CA_CERTS"] = pem
    return env


def _broadcast_env_change():
    try:
        HWND_BROADCAST = 0xFFFF
        WM_SETTINGCHANGE = 0x001A
        SMTO_ABORTIFHUNG = 0x0002
        result = ctypes.c_ulong()
        ctypes.windll.user32.SendMessageTimeoutW(
            HWND_BROADCAST, WM_SETTINGCHANGE, 0,
            ctypes.c_wchar_p("Environment"), SMTO_ABORTIFHUNG, 5000,
            ctypes.byref(result),
        )
    except Exception:
        pass


def persist_ca_env(pem=None):
    """把 NODE_EXTRA_CA_CERTS 写入当前用户持久环境。

    只在启动子进程时注入不够：用户手动执行 `opencode serve` 不会带上证书，
    导致「unknown certificate verification error」反复出现。写入 HKCU\\Environment
    并广播后，之后新起的 opencode 都会自动继承。
    """
    if os.name != "nt":
        return
    pem = pem or ensure_ca_pem()
    if not pem or not os.path.isfile(pem):
        return
    try:
        import winreg
        key = winreg.CreateKeyEx(
            winreg.HKEY_CURRENT_USER, "Environment", 0,
            winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE,
        )
        try:
            cur = winreg.QueryValueEx(key, "NODE_EXTRA_CA_CERTS")[0]
        except OSError:
            cur = None
        if cur != pem:
            winreg.SetValueEx(key, "NODE_EXTRA_CA_CERTS", 0, winreg.REG_SZ, pem)
            _broadcast_env_change()
            write_log("已写入用户环境变量 NODE_EXTRA_CA_CERTS -> %s\n" % pem)
        winreg.CloseKey(key)
    except Exception as e:
        try:
            write_log("写入用户环境变量失败: %r\n" % (e,))
        except Exception:
            pass


def pid_command_line(pid):
    """返回本机进程命令行（Windows；不可用时返回空串）。"""
    if os.name != "nt" or not pid:
        return ""
    try:
        ps = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"),
            "System32", "WindowsPowerShell", "v1.0", "powershell.exe",
        )
        exe = ps if os.path.isfile(ps) else "powershell"
        out = subprocess.run(
            [exe, "-NoProfile", "-NonInteractive", "-Command",
             "(Get-CimInstance Win32_Process -Filter 'ProcessId=%d').CommandLine" % int(pid)],
            creationflags=CREATE_NO_WINDOW, capture_output=True, text=True, timeout=15,
        ).stdout or ""
        for ln in out.splitlines():
            ln = ln.strip()
            if ln:
                return ln
    except Exception:
        pass
    return ""


def opencode_is_managed(pid):
    """4096 上的进程是否为本程序拉起的 opencode（带 --hostname 与证书环境）。

    本程序启动 opencode 时固定带 `--hostname 127.0.0.1` 并注入
    NODE_EXTRA_CA_CERTS；手工执行或旧启动器拉起的 `opencode serve` 没有该参数，
    进程也就缺少证书环境，会导致「unknown certificate verification error」反复出现。
    无法判定（非 Windows / 取不到命令行）时一律当作已托管，避免误杀。
    """
    if not pid:
        return True
    if "opencode" not in pid_image_name(pid).lower():
        return True
    cmd = pid_command_line(pid)
    if not cmd:
        return True
    return "--hostname" in cmd


_OPENCODE_ENSURE_LOCK = threading.Lock()


def ensure_managed_opencode():
    """若 4096 上已运行的 opencode 不是本程序拉起的，则重启它以注入证书环境。"""
    try:
        with _OPENCODE_ENSURE_LOCK:
            pid = port_owner_pid(OPENCODE_PORT)
            if not pid or "opencode" not in pid_image_name(pid).lower():
                return
            if opencode_is_managed(pid):
                return
            write_log("检测到 4096 上非本程序拉起的 opencode（缺少证书环境），重启以修复\n")
            res = restart_opencode()
            if not res.get("ok"):
                write_log("自动修复 opencode 失败：%s\n" % res.get("error"))
    except Exception as e:
        write_log("自动检查 opencode 证书环境失败: %r\n" % (e,))


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


# ============ 本地模型（llama.cpp / GGUF） ============
#
# 思路：把 GGUF 交给本地 llama-server，它提供 OpenAI 兼容的 /v1 接口；再把该地址
# 作为自定义 provider 写入 secrets.json（含 npm=@ai-sdk/openai-compatible），由插件
# 注入 opencode 配置，于是本地模型就能像普通服务商一样在界面里选用。
# 运行时二进制从 llama.cpp 官方 GitHub Releases 下载；有 NVIDIA 显卡时可选 CUDA 构建。

LLAMA_REPO = "ggml-org/llama.cpp"
LLAMA_UA = {"User-Agent": "opencode-chat-launcher"}
LOCAL_DEFAULTS = {
    "enabled": False,       # 随程序启动时自动拉起本地服务
    "runtime": "auto",      # auto | cpu | cuda
    "modelPath": "",
    "modelName": "",        # 留空则按文件名生成
    "port": 8686,
    "ctx": 8192,
    "gpuLayers": -1,        # -1 = 自动（CUDA 全部层 / CPU 0 层）
    "threads": 0,
    "jinja": True,          # 启用 chat 模板与工具调用
    "extraArgs": "",
    "provider": "local",
    "installedVariant": "",
    "installedTag": "",
}
LLAMA_LOCK = threading.Lock()
LLAMA_PROC = None
LLAMA_INSTALLING = False


def load_local():
    data = dict(LOCAL_DEFAULTS)
    loaded = _load_json(LOCAL_FILE)
    if isinstance(loaded, dict):
        for k in LOCAL_DEFAULTS:
            if k in loaded:
                data[k] = loaded[k]
    try:
        data["port"] = int(data.get("port") or 8686)
    except Exception:
        data["port"] = 8686
    try:
        data["ctx"] = int(data.get("ctx") or 8192)
    except Exception:
        data["ctx"] = 8192
    try:
        data["gpuLayers"] = int(data.get("gpuLayers"))
    except Exception:
        data["gpuLayers"] = -1
    try:
        data["threads"] = int(data.get("threads") or 0)
    except Exception:
        data["threads"] = 0
    data["jinja"] = bool(data.get("jinja", True))
    data["enabled"] = bool(data.get("enabled"))
    data["modelPath"] = str(data.get("modelPath") or "").strip()
    data["modelName"] = str(data.get("modelName") or "").strip()
    data["extraArgs"] = str(data.get("extraArgs") or "").strip()
    data["runtime"] = data.get("runtime") if data.get("runtime") in ("auto", "cpu", "cuda") else "auto"
    data["provider"] = str(data.get("provider") or "local").strip() or "local"
    return data


def save_local(data):
    _save_json(LOCAL_FILE, data)


def gguf_alias(path):
    """由 GGUF 文件名生成模型别名（OpenAI /v1/models 里显示的 id）。"""
    name = os.path.basename(str(path or "").strip())
    if name.lower().endswith(".gguf"):
        name = name[:-5]
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")
    return (name[:64] or "local-model")


def resolve_gpu_layers(cfg, cuda):
    """GPU 层数：-1 = 自动（CUDA 全部，CPU 为 0）。"""
    try:
        g = int(cfg.get("gpuLayers", -1))
    except Exception:
        g = -1
    if g < 0:
        return 999 if cuda else 0
    return max(0, g)


def local_server_args(exe, cfg, alias, cuda):
    """构造 llama-server 命令行（纯参数拼装，便于单测）。"""
    try:
        port = int(cfg.get("port") or 8686)
    except Exception:
        port = 8686
    try:
        ctx = int(cfg.get("ctx") or 8192)
    except Exception:
        ctx = 8192
    args = [
        exe, "-m", str(cfg.get("modelPath") or ""),
        "--host", "127.0.0.1", "--port", str(port),
        "-c", str(ctx), "-a", alias, "--no-webui",
        "-ngl", str(resolve_gpu_layers(cfg, cuda)),
    ]
    try:
        threads = int(cfg.get("threads") or 0)
    except Exception:
        threads = 0
    if threads > 0:
        args += ["-t", str(threads)]
    if cfg.get("jinja", True):
        args.append("--jinja")
    extra = str(cfg.get("extraArgs") or "").strip()
    if extra:
        args += extra.split()
    return args


def llama_root_dirs():
    app_root = os.path.dirname(BASE_DIR)
    dirs = []
    # 打包布局：ROOT/runtime 存在时优先随包存放（便携）；否则退回用户配置目录。
    if os.path.isdir(os.path.join(app_root, "runtime")):
        dirs.append(os.path.join(app_root, "runtime", "llama"))
    dirs.append(os.path.join(SECRETS_DIR, "llama"))
    return dirs


def llama_install_dir():
    """选择运行时安装目录（不产生磁盘写入）：优先随包 runtime，否则用户配置目录。"""
    dirs = llama_root_dirs()
    for d in dirs:
        parent = os.path.dirname(d)
        if os.path.isdir(parent) and os.access(parent, os.W_OK):
            return d
    return dirs[-1]


def find_llama_server():
    env_exe = os.environ.get("OC_LLAMA_SERVER", "").strip()
    if env_exe and os.path.isfile(env_exe):
        return env_exe
    for d in llama_root_dirs():
        exe = os.path.join(d, "llama-server.exe")
        if os.path.isfile(exe):
            return exe
    return shutil.which("llama-server") or shutil.which("llama-server.exe")


LLAMA_PID_FILE = os.path.join(SECRETS_DIR, "llama.pid")


def _llama_saved_pid():
    try:
        with open(LLAMA_PID_FILE, "r", encoding="utf-8") as f:
            return int((f.read() or "0").strip())
    except Exception:
        return 0


def _write_llama_pid(pid):
    try:
        os.makedirs(SECRETS_DIR, exist_ok=True)
        with open(LLAMA_PID_FILE, "w", encoding="utf-8") as f:
            f.write(str(int(pid)))
    except Exception:
        pass


def _clear_llama_pid():
    try:
        os.remove(LLAMA_PID_FILE)
    except Exception:
        pass


def _llama_pid_alive(pid):
    """本机 llama-server 进程是否仍在运行（跨中间层重启也能识别）。"""
    if not pid:
        return False
    return "llama" in pid_image_name(pid).lower()


_NVIDIA_CACHE = {"at": 0.0, "value": False}


def has_nvidia():
    """检测是否存在可用的 NVIDIA 显卡（nvidia-smi），结果缓存 5 分钟。"""
    now = time.time()
    if now - _NVIDIA_CACHE["at"] < 300:
        return _NVIDIA_CACHE["value"]
    value = False
    exe = shutil.which("nvidia-smi")
    if exe:
        try:
            r = subprocess.run(
                [exe], creationflags=CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10,
            )
            value = r.returncode == 0
        except Exception:
            value = False
    _NVIDIA_CACHE["at"] = now
    _NVIDIA_CACHE["value"] = value
    return value


def _llama_arch():
    machine = (platform.machine() or "").lower()
    return "arm64" if machine in ("arm64", "aarch64") else "x64"


def llama_asset_patterns(variant):
    """返回需要下载的资源名正则列表（第一个为主包）。"""
    arch = _llama_arch()
    if variant == "cuda" and arch != "x64":
        variant = "cpu"
    if variant == "cuda":
        main = re.compile(r"^llama-b\d+-bin-win-cuda-12\.4-x64\.zip$")
        cudart = re.compile(r"^cudart-llama-bin-win-cuda-12\.4-x64\.zip$")
        return [main, cudart], "cuda"
    main = re.compile(r"^llama-b\d+-bin-win-cpu-%s\.zip$" % arch)
    return [main], "cpu"


def llama_release_assets(variant):
    """查询 llama.cpp Releases，返回要下载的 zip 直链与版本号。"""
    patterns, variant = llama_asset_patterns(variant)
    api = "https://api.github.com/repos/%s/releases?per_page=20" % LLAMA_REPO
    req = urllib.request.Request(api, headers=dict(LLAMA_UA, Accept="application/vnd.github+json"))
    with urllib.request.urlopen(req, timeout=30) as r:
        releases = json.loads(r.read().decode("utf-8", "replace"))
    for rel in releases:
        assets = rel.get("assets") or []
        names = {a.get("name"): a.get("browser_download_url") for a in assets}
        chosen = []
        for pat in patterns:
            hit = next((n for n in names if pat.match(n or "")), None)
            if not hit:
                chosen = []
                break
            chosen.append(names[hit])
        if chosen:
            return {"tag": rel.get("tag_name") or "", "urls": chosen, "variant": variant}
    raise RuntimeError("未找到适用于本机的 llama.cpp Windows 构建")


def _llama_status_write(**kw):
    try:
        os.makedirs(SECRETS_DIR, exist_ok=True)
        kw["updated"] = int(time.time())
        tmp = LLAMA_STATUS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(kw, f, ensure_ascii=False)
        os.replace(tmp, LLAMA_STATUS_FILE)
    except Exception:
        pass


def _download_file(url, dest, on_progress=None):
    total = 0
    req = urllib.request.Request(url, headers=LLAMA_UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as f:
        try:
            clen = int(r.headers.get("Content-Length") or 0)
        except Exception:
            clen = 0
        if on_progress:
            on_progress(0, clen)
        last = 0
        while True:
            chunk = r.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
            if on_progress and (total - last >= 1024 * 1024 or (clen and total >= clen)):
                last = total
                on_progress(total, clen)
    return total


def _safe_extract(zf, dest):
    dest_abs = os.path.abspath(dest)
    for member in zf.infolist():
        target = os.path.abspath(os.path.join(dest, member.filename))
        if not (target == dest_abs or target.startswith(dest_abs + os.sep)):
            continue
        if member.is_dir():
            os.makedirs(target, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(member) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def _local_install_worker(variant):
    global LLAMA_INSTALLING
    dest = llama_install_dir()
    try:
        os.makedirs(dest, exist_ok=True)
        _llama_status_write(state="resolving", variant=variant)
        info = llama_release_assets(variant)
        urls = info["urls"]
        for idx, url in enumerate(urls):
            fd, tmp = tempfile.mkstemp(suffix=".zip")
            os.close(fd)
            try:
                _llama_status_write(state="downloading", variant=info["variant"],
                                    tag=info["tag"], index=idx + 1, count=len(urls),
                                    received=0, total=0)
                _download_file(url, tmp, on_progress=lambda r, t: _llama_status_write(
                    state="downloading", variant=info["variant"], tag=info["tag"],
                    index=idx + 1, count=len(urls), received=r, total=t))
                _llama_status_write(state="extracting", variant=info["variant"], tag=info["tag"])
                with zipfile.ZipFile(tmp) as zf:
                    _safe_extract(zf, dest)
            finally:
                try:
                    os.remove(tmp)
                except Exception:
                    pass
        exe = os.path.join(dest, "llama-server.exe")
        if not os.path.isfile(exe):
            raise RuntimeError("压缩包内未找到 llama-server.exe")
        with open(os.path.join(dest, "llama-build.json"), "w", encoding="utf-8") as f:
            json.dump({"variant": info["variant"], "tag": info["tag"]}, f)
        cfg = load_local()
        cfg["installedVariant"] = info["variant"]
        cfg["installedTag"] = info["tag"]
        save_local(cfg)
        _llama_status_write(state="ready", variant=info["variant"], tag=info["tag"], path=exe)
        write_log("llama.cpp 运行时已就绪: %s (%s %s)\n" % (exe, info["variant"], info["tag"]))
    except Exception as e:
        write_log("安装 llama.cpp 运行时失败: %r\n" % (e,))
        _llama_status_write(state="error", variant=variant, error=str(e))
    finally:
        with LLAMA_LOCK:
            LLAMA_INSTALLING = False


def llama_install(variant):
    global LLAMA_INSTALLING
    variant = variant if variant in ("cpu", "cuda") else ("cuda" if has_nvidia() else "cpu")
    with LLAMA_LOCK:
        if LLAMA_INSTALLING:
            return {"ok": False, "error": "正在安装中，请稍候", "installing": True}
        LLAMA_INSTALLING = True
    t = threading.Thread(target=_local_install_worker, args=(variant,), daemon=True)
    t.start()
    return {"ok": True, "installing": True, "variant": variant}


def _llama_install_status():
    return _load_json(LLAMA_STATUS_FILE)


def local_health(port, timeout=1.5):
    try:
        conn = http.client.HTTPConnection("127.0.0.1", int(port), timeout=timeout)
        conn.request("GET", "/v1/models")
        resp = conn.getresponse()
        data = resp.read()
        conn.close()
        if resp.status != 200:
            return False
        return b'"data"' in data or b'"object"' in data
    except Exception:
        return False


def _local_variant_for_run(cfg):
    v = cfg.get("installedVariant") or cfg.get("runtime") or "auto"
    if v in ("cpu", "cuda"):
        return v
    return "cuda" if has_nvidia() else "cpu"


def register_local_provider(cfg, alias, variant):
    data = load_secrets()
    provider = cfg.get("provider") or "local"
    entry = dict(data.get(provider) if isinstance(data.get(provider), dict) else {})
    entry["key"] = dpapi_encrypt("sk-local")
    entry["baseURL"] = "http://127.0.0.1:%d/v1" % int(cfg.get("port") or 8686)
    entry["models"] = [alias]
    entry["npm"] = "@ai-sdk/openai-compatible"
    entry["name"] = "本地模型 (llama.cpp)"
    data[provider] = entry
    save_secrets(data)
    return provider


def local_start(skip_restart=False):
    global LLAMA_PROC
    cfg = load_local()
    exe = find_llama_server()
    if not exe:
        return {"ok": False, "error": "尚未安装本地运行时，请先点「安装运行时」"}
    model = cfg.get("modelPath") or ""
    if not model or not os.path.isfile(model):
        return {"ok": False, "error": "请选择一个有效的 GGUF 模型文件"}
    port = int(cfg.get("port") or 8686)
    alias = cfg.get("modelName") or gguf_alias(model)
    if local_health(port):
        provider = register_local_provider(cfg, alias, _local_variant_for_run(cfg))
        if not skip_restart:
            threading.Thread(target=restart_opencode, daemon=True).start()
        return {"ok": True, "already": True, "port": port, "alias": alias, "provider": provider}
    # 已在启动中（本进程，或上次中间层重启遗留、仍在加载模型的 llama-server）
    if (LLAMA_PROC is not None and LLAMA_PROC.poll() is None) or _llama_pid_alive(_llama_saved_pid()):
        return {"ok": True, "starting": True, "port": port, "alias": alias}
    if port_open(port):
        return {"ok": False, "error": "端口 %d 已被其它程序占用，请在设置里换个端口" % port}
    variant = _local_variant_for_run(cfg)
    args = local_server_args(exe, cfg, alias, variant == "cuda")
    try:
        os.makedirs(os.path.dirname(LLAMA_LOG_FILE), exist_ok=True)
        logf = open(LLAMA_LOG_FILE, "a", encoding="utf-8")
        logf.write("\n==== %s start %s ====\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), alias))
        logf.flush()
        proc = subprocess.Popen(
            args, cwd=os.path.dirname(exe), creationflags=CREATE_NO_WINDOW,
            stdout=logf, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
        )
    except Exception as e:
        return {"ok": False, "error": "启动 llama-server 失败: %s" % e}
    LLAMA_PROC = proc
    _write_llama_pid(proc.pid)
    provider = register_local_provider(cfg, alias, variant)
    if not skip_restart:
        threading.Thread(target=restart_opencode, daemon=True).start()
    return {"ok": True, "starting": True, "port": port, "alias": alias,
            "provider": provider, "pid": proc.pid}


def local_stop():
    global LLAMA_PROC
    cfg = load_local()
    port = int(cfg.get("port") or 8686)
    pids = []
    proc = LLAMA_PROC
    if proc is not None and proc.poll() is None:
        pids.append(proc.pid)
    owner = port_owner_pid(port)
    if owner:
        pids.append(owner)
    saved = _llama_saved_pid()
    if saved:
        pids.append(saved)
    killed = False
    for pid in dict.fromkeys(pids):
        if "llama" not in pid_image_name(pid).lower():
            continue
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
        if not port_open(port):
            break
        time.sleep(0.25)
    LLAMA_PROC = None
    _clear_llama_pid()
    return {"ok": True, "killed": killed, "port": port}


def local_unregister():
    data = load_secrets()
    provider = load_local().get("provider") or "local"
    if provider in data:
        data.pop(provider, None)
        save_secrets(data)
    return provider


def local_scan(dirpath):
    """列出目录（含一级子目录）下的 .gguf 文件，供前端选择。"""
    root = os.path.abspath(os.path.expanduser(str(dirpath or "").strip() or os.path.expanduser("~")))
    out = []
    try:
        for name in sorted(os.listdir(root)):
            full = os.path.join(root, name)
            if os.path.isfile(full) and name.lower().endswith(".gguf"):
                out.append({"path": full, "name": name, "size": os.path.getsize(full)})
            elif os.path.isdir(full):
                try:
                    for sub in sorted(os.listdir(full)):
                        subfull = os.path.join(full, sub)
                        if os.path.isfile(subfull) and sub.lower().endswith(".gguf"):
                            out.append({"path": subfull, "name": name + "/" + sub, "size": os.path.getsize(subfull)})
                except Exception:
                    continue
    except Exception as e:
        raise ValueError("无法读取目录: %s" % e)
    return {"ok": True, "dir": root, "files": out[:500]}


def local_status():
    cfg = load_local()
    exe = find_llama_server()
    port = int(cfg.get("port") or 8686)
    running = local_health(port)
    proc = LLAMA_PROC
    starting = bool(proc is not None and proc.poll() is None and not running)
    st = _llama_install_status()
    with LLAMA_LOCK:
        installing = LLAMA_INSTALLING
    return {
        "ok": True,
        "runtime": {
            "installed": bool(exe),
            "path": exe or "",
            "variant": cfg.get("installedVariant") or "",
            "tag": cfg.get("installedTag") or "",
            "installDir": llama_install_dir(),
        },
        "nvidia": has_nvidia(),
        "running": running,
        "starting": starting,
        "pid": (proc.pid if (proc is not None and proc.poll() is None) else 0),
        "install": {"installing": installing, **(st if isinstance(st, dict) else {})},
        "config": cfg,
    }


def local_autostart():
    """中间层启动时，若用户启用了本地模型则自动拉起 llama-server。"""
    try:
        cfg = load_local()
        if not cfg.get("enabled") or not cfg.get("modelPath"):
            return
        if not find_llama_server():
            return
        local_start(skip_restart=True)
    except Exception as e:
        write_log("本地模型自动启动失败: %r\n" % (e,))


def _restart_log(text):
    try:
        os.makedirs(SECRETS_DIR, exist_ok=True)
        with open(RESTART_LOG, "a", encoding="utf-8") as f:
            f.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), text))
    except Exception:
        pass


def _http_ok(port, path="/api/_version", timeout=2):
    try:
        conn = http.client.HTTPConnection("127.0.0.1", int(port), timeout=timeout)
        conn.request("GET", path)
        resp = conn.getresponse()
        data = json.loads(resp.read().decode("utf-8"))
        conn.close()
        return bool(isinstance(data, dict) and data.get("ok"))
    except Exception:
        return False


def spawn_app_restart(port=None, pid=None):
    """由**独立助手进程**重启中间层；不在服务内部自重启，避免无进程接管端口。"""
    port = int(port or LISTEN_PORT)
    pid = int(pid if pid is not None else os.getpid())
    exe = sys.executable or "python"
    args = [exe, os.path.abspath(__file__), "--restart-helper",
            "--pid", str(pid), "--port", str(port)]
    env = dict(os.environ)
    env["OPENCODE_PORT"] = str(UPSTREAM_PORT)
    env["FRONT_PORT"] = str(port)
    flags = CREATE_NO_WINDOW
    if hasattr(subprocess, "DETACHED_PROCESS"):
        flags |= subprocess.DETACHED_PROCESS
    subprocess.Popen(
        args, cwd=BASE_DIR, env=env, creationflags=flags, close_fds=True,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    _restart_log("helper spawned (pid=%d -> port=%d)" % (pid, port))
    return True


def restart_helper_main(pid, port):
    """独立重启助手：结束旧中间层 -> 等端口释放 -> 同端口拉起新进程并校验就绪。"""
    port = int(port)
    _restart_log("helper start target_pid=%s port=%d" % (pid, port))
    time.sleep(1.5)  # 等旧进程把 HTTP 响应写完
    if pid and pid != os.getpid():
        try:
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/F"],
                creationflags=CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
            _restart_log("taskkill sent pid=%s" % pid)
        except Exception as e:
            _restart_log("taskkill failed: %r" % (e,))
    for _ in range(60):
        if not port_in_use(port):
            break
        time.sleep(0.25)
    if port_in_use(port):
        _restart_log("port %d 仍被占用，放弃拉起（避免抢占失败导致彻底无服务）" % port)
        return 1
    env = dict(os.environ)
    env["OPENCODE_PORT"] = str(UPSTREAM_PORT)
    env["FRONT_PORT"] = str(port)
    exe = sys.executable or "python"
    for attempt in range(1, 4):
        try:
            subprocess.Popen(
                [exe, os.path.abspath(__file__)], cwd=BASE_DIR, env=env,
                creationflags=CREATE_NO_WINDOW, close_fds=True,
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except Exception as e:
            _restart_log("spawn attempt=%d failed: %r" % (attempt, e))
            time.sleep(1.0)
            continue
        for _ in range(60):
            if _http_ok(port):
                _restart_log("helper ok (attempt=%d, port=%d)" % (attempt, port))
                return 0
            time.sleep(0.25)
        _restart_log("新中间层未就绪 (attempt=%d)" % attempt)
    _restart_log("helper failed: 中间层重启失败，请重新打开本程序")
    return 1


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
        if origin and not self._origin_ok():
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

    def _is_local_addr(self):
        ip = self.client_address[0] if self.client_address else ""
        return ip in ("127.0.0.1", "::1", "localhost") or ip.startswith("127.")

    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        try:
            u = urllib.parse.urlsplit(origin)
        except Exception:
            return False
        if u.scheme not in ("http", "https"):
            return False
        host = (self.headers.get("Host") or "").strip().lower()
        if not host:
            return False
        return u.netloc.lower() == host

    def _cookie_token(self):
        cookie = self.headers.get("Cookie") or ""
        m = re.search(r"(?:^|;\s*)oc_token=([^;]+)", cookie)
        return urllib.parse.unquote(m.group(1)) if m else ""

    def _guard(self, parsed):
        sfs = (self.headers.get("Sec-Fetch-Site") or "").lower()
        if sfs and sfs not in ("same-origin", "none"):
            self.send_error(403, "cross-site blocked")
            return False
        if not self._origin_ok():
            self.send_error(403, "origin blocked")
            return False
        token = self.headers.get("X-OC-Token")
        if not token:
            qs = urllib.parse.parse_qs(parsed.query)
            token = (qs.get("token") or [""])[0]
        if not token:
            token = self._cookie_token()
        if self._is_local_addr():
            if token != SESSION_TOKEN:
                self.send_error(403, "invalid token")
                return False
            return True
        if not remote_enabled():
            self.send_error(403, "remote access disabled")
            return False
        with REMOTE_LOCK:
            valid = bool(token) and token in REMOTE_SESSIONS
        if not valid:
            self.send_error(401, "login required")
            return False
        return True

    def _require_local(self):
        if self._is_local_addr():
            return True
        self.send_error(403, "local only")
        return False

    def _read_body(self):
        self._body_read = True
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        try:
            n = int(length)
        except ValueError:
            return b""
        if n <= 0:
            return b""
        return self.rfile.read(n)

    def _drain_body(self):
        """把尚未读取的请求体读完，避免在 keep-alive 连接上未读数据随关闭触发 RST。"""
        if getattr(self, "_body_read", False):
            return
        length = self.headers.get("Content-Length")
        if not length:
            return
        try:
            n = int(length)
        except ValueError:
            return
        self._body_read = True
        remaining = n
        while remaining > 0:
            chunk = self.rfile.read(min(remaining, 65536))
            if not chunk:
                break
            remaining -= len(chunk)

    def send_error(self, code, message=None, explain=None):
        try:
            self._drain_body()
        except Exception:
            pass
        super().send_error(code, message, explain)

    def _route(self):
        self._body_read = False
        parsed = urllib.parse.urlsplit(self.path)
        if parsed.path == "/api/_version":
            self._version()
            return
        if parsed.path == "/api/_remote/status":
            self._remote_status()
            return
        if parsed.path == "/api/_login":
            self._login()
            return
        if parsed.path == "/api/_logout":
            self._logout()
            return
        if parsed.path == "/api" or parsed.path.startswith("/api/"):
            if not self._guard(parsed):
                return
        if parsed.path == "/api/_mkdir":
            self._mkdir()
        elif parsed.path == "/api/_move":
            if not self._require_local():
                return
            self._move()
        elif parsed.path == "/api/_secret":
            if not self._require_local():
                return
            self._secret(parsed)
        elif parsed.path == "/api/_secret/purge":
            if not self._require_local():
                return
            self._secret_purge()
        elif parsed.path == "/api/_profile":
            if self.command != "GET" and not self._is_local_addr():
                self.send_error(403, "local only")
                return
            self._profile()
        elif parsed.path == "/api/_remote":
            if not self._require_local():
                return
            self._remote_admin(parsed)
        elif parsed.path == "/api/_server":
            if not self._require_local():
                return
            self._server_admin()
        elif parsed.path == "/api/_opencode/restart":
            if not self._require_local():
                return
            self._opencode_restart()
        elif parsed.path == "/api/_app/restart":
            if not self._require_local():
                return
            self._app_restart()
        elif parsed.path == "/api/_opencode/status":
            self._opencode_status()
        elif parsed.path == "/api/_local":
            if not self._require_local():
                return
            self._local_admin()
        elif parsed.path == "/api/_local/install":
            if not self._require_local():
                return
            self._local_install()
        elif parsed.path == "/api/_local/start":
            if not self._require_local():
                return
            self._local_start()
        elif parsed.path == "/api/_local/stop":
            if not self._require_local():
                return
            self._local_stop()
        elif parsed.path == "/api/_local/scan":
            if not self._require_local():
                return
            self._local_scan()
        elif parsed.path == "/api/_drives":
            self._drives()
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
        self._json({
            "ok": True, "version": ver, "pid": os.getpid(),
            "port": LISTEN_PORT, "lan": bool(remote_enabled()),
        })

    def _remote_status(self):
        local = self._is_local_addr()
        token = self._cookie_token()
        with REMOTE_LOCK:
            logged = bool(token) and token in REMOTE_SESSIONS
        self._json({
            "ok": True,
            "remote": not local,
            "authed": local or logged,
            "enabled": remote_enabled(),
        })

    def _login(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        if not self._origin_ok():
            self.send_error(403, "origin blocked")
            return
        if self._is_local_addr():
            self._json({"ok": True, "local": True})
            return
        if not remote_enabled():
            self._json({"ok": False, "error": "远程访问未开启"}, 403)
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        cfg = load_remote()
        if not verify_password(req.get("password") or "", cfg.get("password")):
            time.sleep(0.6)
            self._json({"ok": False, "error": "密码错误"}, 401)
            return
        token = _secrets.token_urlsafe(32)
        with REMOTE_LOCK:
            REMOTE_SESSIONS.add(token)
        data = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", "oc_token=%s; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000" % token)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _logout(self):
        token = self._cookie_token()
        if token:
            with REMOTE_LOCK:
                REMOTE_SESSIONS.discard(token)
        data = b'{"ok":true}'
        self.send_response(200)
        for k, v in SECURITY_HEADERS:
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", "oc_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _remote_admin(self, parsed):
        if self.command == "GET":
            cfg = load_remote()
            self._json({
                "ok": True,
                "enabled": bool(cfg.get("enabled")),
                "hasPassword": bool(cfg.get("password")),
                "addresses": lan_addresses(LISTEN_PORT),
                "port": LISTEN_PORT,
                "active": LISTEN_PORT,
                "lan": bool(remote_enabled()),
            })
            return
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        cfg = load_remote()
        if req.get("clearPassword"):
            cfg = {"enabled": False}
        else:
            if "enabled" in req:
                cfg["enabled"] = bool(req.get("enabled"))
            pw = req.get("password")
            if isinstance(pw, str) and pw:
                if len(pw) < 4:
                    self.send_error(400, "password too short")
                    return
                cfg["password"] = hash_password(pw)
        if cfg.get("enabled") and not cfg.get("password"):
            self.send_error(400, "password required to enable remote access")
            return
        save_remote(cfg)
        self._json({
            "ok": True,
            "enabled": bool(cfg.get("enabled")),
            "hasPassword": bool(cfg.get("password")),
            "addresses": lan_addresses(LISTEN_PORT),
            "port": LISTEN_PORT,
            "active": LISTEN_PORT,
            "lan": bool(cfg.get("enabled") and cfg.get("password")),
        })

    def _server_admin(self):
        if self.command == "GET":
            self._json({
                "ok": True,
                "port": int(load_server_conf().get("port") or 0),
                "active": LISTEN_PORT,
                "default": 8000,
            })
            return
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        try:
            port = int(req.get("port"))
        except (TypeError, ValueError):
            self.send_error(400, "invalid port")
            return
        if not (1 <= port <= 65535):
            self.send_error(400, "port out of range")
            return
        if port == UPSTREAM_PORT:
            self.send_error(400, "port conflicts with opencode")
            return
        if port != LISTEN_PORT and port_in_use(port):
            self.send_error(409, "port already in use")
            return
        cfg = load_server_conf()
        cfg["port"] = port
        save_server_conf(cfg)
        self._json({"ok": True, "port": port, "active": LISTEN_PORT})

    def _opencode_restart(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        result = restart_opencode()
        self._json(result, 200 if result.get("ok") else 500)

    def _app_restart(self):
        """重启 opencode + 中间层（中间层由独立助手进程接管，前端随后轮询恢复）。"""
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        oc = restart_opencode()
        try:
            spawn_app_restart(LISTEN_PORT, os.getpid())
            spawned = True
            err = ""
        except Exception as e:
            spawned = False
            err = "启动重启助手失败: %s" % e
            _restart_log(err)
        self._json({
            "ok": spawned,
            "opencode": bool(oc.get("ok")),
            "opencode_error": oc.get("error", ""),
            "middle": spawned,
            "error": err,
            "port": LISTEN_PORT,
        }, 200 if spawned else 500)

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

    def _local_admin(self):
        if self.command == "GET":
            self._json(local_status())
            return
        if self.command == "DELETE":
            provider = local_unregister()
            self._json({"ok": True, "provider": provider})
            return
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        merged = dict(load_local())
        for k in ("enabled", "runtime", "modelPath", "modelName", "port", "ctx",
                  "gpuLayers", "threads", "jinja", "extraArgs", "provider"):
            if k in req:
                merged[k] = req[k]
        try:
            port = int(merged.get("port"))
            ctx = int(merged.get("ctx"))
        except (TypeError, ValueError):
            self.send_error(400, "invalid port / ctx")
            return
        if not (1 <= port <= 65535):
            self.send_error(400, "port out of range")
            return
        if port in (UPSTREAM_PORT, LISTEN_PORT):
            self.send_error(400, "port conflicts with app")
            return
        if not (512 <= ctx <= 1048576):
            self.send_error(400, "ctx out of range")
            return
        save_local(merged)
        self._json({"ok": True, "config": load_local()})

    def _local_install(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        variant = str(req.get("variant") or "").strip()
        if variant not in ("cpu", "cuda"):
            variant = "cuda" if has_nvidia() else "cpu"
        result = llama_install(variant)
        self._json(result, 200 if result.get("ok") else 409)

    def _local_start(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        result = local_start()
        self._json(result, 200 if result.get("ok") else 400)

    def _local_stop(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        self._json(local_stop())

    def _local_scan(self):
        if self.command != "POST":
            self.send_error(405, "method not allowed")
            return
        try:
            req = json.loads(self._read_body().decode("utf-8") or "{}")
        except Exception:
            req = {}
        try:
            self._json(local_scan(req.get("dir")))
        except Exception as e:
            self.send_error(400, "scan error: %s" % e)

    def _drives(self):
        """列出本机盘符（供电脑文件浏览切换 C: / D: …）。"""
        drives = []
        try:
            if hasattr(os, "listdrives"):
                drives = [d.rstrip("\\/") for d in os.listdrives()]
            else:
                for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                    if os.path.exists(c + ":\\"):
                        drives.append(c + ":")
        except Exception:
            drives = []
        drives = sorted(set(d for d in drives if d and d.endswith(":")))
        self._json({"ok": True, "drives": drives})

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

    def _move(self):
        """移动（跨盘迁移）一个目录，用于把助手工作区搬到其他盘。"""
        try:
            raw = self._read_body()
            req = json.loads(raw.decode("utf-8") or "{}")
            src = (req.get("src") or "").strip()
            dst = (req.get("dst") or "").strip()
            if not src or not dst:
                raise ValueError("src and dst are required")
            src = os.path.abspath(os.path.expanduser(src))
            dst = os.path.abspath(os.path.expanduser(dst))
            if src == dst:
                raise ValueError("src and dst are the same")
            if os.path.normcase(dst).startswith(os.path.normcase(src) + os.sep):
                raise ValueError("destination is inside source")
            created = False
            if os.path.exists(src):
                if not os.path.isdir(src):
                    raise ValueError("source is not a directory")
                if os.path.exists(dst):
                    raise ValueError("destination already exists")
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.move(src, dst)
            else:
                os.makedirs(dst, exist_ok=True)
                created = True
        except Exception as e:
            self.send_error(400, "move error: %s" % e)
            return
        self._json({"ok": True, "src": src, "dst": dst, "created": created})

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

        # 去重：某些输入法 / 触屏会把回车或发送动作触发两次，导致同一条消息被
        # 重复提交（用户会看到「助手答完后自己又发了一遍」/空消息）。这里对同一
        # 会话、内容完全相同的 prompt_async 请求在短时间内只放行一次。
        dedupe_key = None
        if (
            self.command == "POST"
            and body
            and base.startswith("/session/")
            and base.endswith("/prompt_async")
        ):
            dedupe_key = base + "|" + hashlib.sha1(body).hexdigest()
            now = time.time()
            with PROMPT_DEDUP_LOCK:
                last = PROMPT_DEDUP.get(dedupe_key)
                if last is not None and now - last < PROMPT_DEDUP_WINDOW:
                    self.send_response(204)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                PROMPT_DEDUP[dedupe_key] = now
                if len(PROMPT_DEDUP) > 256:
                    for k in [k for k, v in PROMPT_DEDUP.items() if now - v > 10]:
                        PROMPT_DEDUP.pop(k, None)

        try:
            conn = http.client.HTTPConnection(UPSTREAM_HOST, UPSTREAM_PORT, timeout=300)
            conn.request(self.command, upstream_path, body=body, headers=headers)
            resp = conn.getresponse()
        except Exception as e:
            if dedupe_key is not None:
                with PROMPT_DEDUP_LOCK:
                    PROMPT_DEDUP.pop(dedupe_key, None)
            self.send_error(502, "upstream error: %s" % e)
            return

        ctype = resp.getheader("Content-Type", "")
        is_sse = ctype.startswith("text/event-stream")
        # 上游报错时不占用去重名额，方便用户直接重试。
        if dedupe_key is not None and resp.status >= 400:
            with PROMPT_DEDUP_LOCK:
                PROMPT_DEDUP.pop(dedupe_key, None)

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
        if ext == ".html" and rel == "index.html" and self._is_local_addr():
            self.send_header("Set-Cookie", "oc_token=%s; HttpOnly; SameSite=Strict; Path=/" % SESSION_TOKEN)
        self.send_header("Content-Length", str(len(data)))
        if ext in (".html", ".js", ".css"):
            self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        write_log("server error: %r\n" % (exc,))
        super().handle_error(request, client_address)


def main():
    global LISTEN_PORT
    host = lan_host()
    candidates = []
    for p in [LISTEN_PORT, 8000] + list(range(8001, 8011)):
        if p and p not in candidates:
            candidates.append(p)
    server = None
    bound = None
    for p in candidates:
        try:
            server = Server((host, p), Handler)
            bound = p
            break
        except OSError:
            continue
    if server is None:
        write_log("无法绑定端口（候选均被占用）：%s\n" % candidates)
        raise SystemExit(1)
    if bound != LISTEN_PORT:
        write_log("端口 %d 不可用，已回退到 %d\n" % (LISTEN_PORT, bound))
        LISTEN_PORT = bound
    write_active(bound, host)
    write_log("proxy on http://%s:%d -> http://%s:%d%s\n" % (
        host, bound, UPSTREAM_HOST, UPSTREAM_PORT,
        ("  (log: %s)" % LOG_FILE) if LOG_FILE else "",
    ))
    persist_ca_env()
    local_autostart()
    threading.Thread(target=ensure_managed_opencode, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    if "--restart-helper" in sys.argv:
        def _arg(name, default):
            if name in sys.argv:
                try:
                    return int(sys.argv[sys.argv.index(name) + 1])
                except (IndexError, ValueError):
                    pass
            return default
        raise SystemExit(restart_helper_main(_arg("--pid", 0), _arg("--port", LISTEN_PORT)))
    main()
