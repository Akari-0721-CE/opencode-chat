# -*- coding: utf-8 -*-
"""opencode chat 启动器。

职责：
  1. 安装 / 更新 opencode 插件（~/.config/opencode/plugins/ 自动加载）。
  2. 确保本地代理 server.py 在 8000 端口运行（用随包便携 Python）。
  3. 确保 opencode serve 在 4096 端口运行（缺失时自动 npm 安装）。
  4. 用 Edge --app 打开应用窗口。

不依赖第三方库，仅标准库。
"""
import ctypes
import hashlib
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

IS_WIN = os.name == "nt"
CREATE_NO_WINDOW = 0x08000000 if IS_WIN else 0

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_DIR = os.path.join(ROOT, "app")
PYTHON_DIR = os.path.join(ROOT, "runtime", "python")
PYTHON = os.path.join(PYTHON_DIR, "python.exe")
SERVER_PY = os.path.join(APP_DIR, "server.py")
VERSION_FILE = os.path.join(APP_DIR, "VERSION")
PLUGIN_SRC = os.path.join(APP_DIR, "plugin", "base-override.ts")
OPENCODE_RUNTIME_DIR = os.path.join(ROOT, "runtime", "opencode")
OPENCODE_RUNTIME_EXE = os.path.join(OPENCODE_RUNTIME_DIR, "opencode.exe")

NPM_REGISTRIES = ("https://registry.npmjs.org", "https://registry.npmmirror.com")
HTTP_UA = {"User-Agent": "opencode-chat-launcher"}

HOME = os.path.expanduser("~")
DATA_DIR = os.path.join(HOME, ".config", "opencode-chat")
LOG_DIR = os.path.join(DATA_DIR, "logs")
STATUS_FILE = os.path.join(DATA_DIR, "opencode-install.json")
OPENCODE_CONFIG = os.path.join(HOME, ".config", "opencode")
OPENCODE_PLUGIN_AUTO = os.path.join(OPENCODE_CONFIG, "plugins")
OPENCODE_PLUGIN_COMPAT = os.path.join(OPENCODE_CONFIG, "plugin")
OPENCODE_CONFIG_FILE = os.path.join(OPENCODE_CONFIG, "opencode.jsonc")

FRONT_PORT = int(os.environ.get("FRONT_PORT", "8000"))
OPENCODE_PORT = int(os.environ.get("OPENCODE_PORT", "4096"))


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + str(msg)
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
        with open(os.path.join(LOG_DIR, "launcher.log"), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def msgbox(text, title="opencode chat", icon=0x40):
    if not IS_WIN:
        return
    try:
        ctypes.windll.user32.MessageBoxW(0, text, title, icon)
    except Exception:
        pass


def app_version():
    try:
        with open(VERSION_FILE, "r", encoding="utf-8") as f:
            return f.read().strip()
    except Exception:
        return ""


def write_status(**kw):
    """供前端轮询的安装进度（%USERPROFILE%\\.config\\opencode-chat\\opencode-install.json）。"""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        kw["updated"] = int(time.time())
        tmp = STATUS_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(kw, f, ensure_ascii=False)
        os.replace(tmp, STATUS_FILE)
    except Exception:
        pass


def port_open(port, host="127.0.0.1"):
    s = socket.socket()
    s.settimeout(0.4)
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


def http_get_json(url, timeout=3):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


def _proc_image(pid):
    if not IS_WIN:
        return None
    try:
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
        if not h:
            return None
        try:
            buf = ctypes.create_unicode_buffer(32768)
            size = ctypes.c_ulong(len(buf))
            if k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(size)):
                return buf.value
        finally:
            k32.CloseHandle(h)
    except Exception:
        return None
    return None


def _under(path, root):
    try:
        p = os.path.normcase(os.path.abspath(path))
        r = os.path.normcase(os.path.abspath(root))
        return p == r or p.startswith(r + os.sep)
    except Exception:
        return False


def kill_pid(pid):
    if not pid:
        return
    try:
        if IS_WIN:
            subprocess.run(
                ["taskkill", "/PID", str(int(pid)), "/F"],
                creationflags=CREATE_NO_WINDOW,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
        else:
            os.kill(int(pid), 15)
    except Exception as e:
        log("结束进程 %r 失败: %r" % (pid, e))


def _copy_if_changed(src, dst):
    try:
        if os.path.isfile(dst):
            with open(src, "rb") as a, open(dst, "rb") as b:
                if a.read() == b.read():
                    return False
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        return True
    except Exception as e:
        log("写入 %s 失败: %r" % (dst, e))
        return False


def find_opencode():
    if os.path.isfile(OPENCODE_RUNTIME_EXE):
        return OPENCODE_RUNTIME_EXE
    appdata = os.environ.get("APPDATA", "")
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        os.path.join(appdata, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"),
        os.path.join(local, "opencode", "opencode.exe"),
        os.path.join(local, "Programs", "opencode", "opencode.exe"),
        os.path.join(appdata, "npm", "opencode.exe"),
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            return c
    return shutil.which("opencode")


def opencode_platform_pkg():
    machine = (platform.machine() or "").lower()
    if machine in ("arm64", "aarch64"):
        return "opencode-windows-arm64"
    return "opencode-windows-x64"


def _http_open(url, timeout=30):
    req = urllib.request.Request(url, headers=HTTP_UA)
    return urllib.request.urlopen(req, timeout=timeout)


def _registry_meta(pkg):
    for base in NPM_REGISTRIES:
        try:
            with _http_open("%s/%s/latest" % (base, pkg), timeout=20) as r:
                meta = json.loads(r.read().decode("utf-8", "replace"))
            tarball = (meta.get("dist") or {}).get("tarball")
            if tarball:
                log("opencode 下载源: %s (v%s)" % (base, meta.get("version", "?")))
                return meta
        except Exception as e:
            log("查询下载源 %s 失败: %r" % (base, e))
    return None


def _download(url, dest, progress=None):
    total = 0
    last = 0
    with _http_open(url, timeout=60) as r, open(dest, "wb") as f:
        try:
            clen = int(r.headers.get("Content-Length") or 0)
        except Exception:
            clen = 0
        if progress:
            progress(0, clen)
        while True:
            chunk = r.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)
            if progress and (total - last >= 512 * 1024 or (clen and total >= clen)):
                last = total
                progress(total, clen)
    return total


def install_opencode_binary():
    pkg = opencode_platform_pkg()
    meta = _registry_meta(pkg)
    if not meta:
        write_status(state="error", error="无法获取 opencode 下载源")
        return None
    tarball = meta["dist"]["tarball"]
    shasum = (meta["dist"].get("shasum") or "").lower()
    ver = meta.get("version", "")
    write_status(state="downloading", received=0, total=0, version=ver)
    msgbox(
        "首次运行需要下载 opencode 运行组件（约 60-100 MB），\n"
        "视网络情况可能需要几分钟，请勿关闭程序。\n\n"
        "界面顶部会显示下载进度，下载完成后自动继续。",
        "opencode chat 首次运行", 0x40,
    )
    fd, tmp = tempfile.mkstemp(suffix=".tgz")
    os.close(fd)
    target_tmp = OPENCODE_RUNTIME_EXE + ".tmp"
    try:
        size = _download(
            tarball, tmp,
            progress=lambda r, t: write_status(state="downloading", received=r, total=t, version=ver),
        )
        if shasum:
            write_status(state="verifying", received=size, total=size, version=ver)
            h = hashlib.sha1()
            with open(tmp, "rb") as f:
                for block in iter(lambda: f.read(1024 * 1024), b""):
                    h.update(block)
            if h.hexdigest().lower() != shasum:
                log("opencode 二进制校验和不匹配（期望 %s）" % shasum)
                write_status(state="error", version=ver, error="校验和不匹配")
                return None
        write_status(state="extracting", received=size, total=size, version=ver)
        log("opencode 下载完成 %.1f MB，正在解压 ..." % (size / 1048576.0))
        found = False
        with tarfile.open(tmp, "r:gz") as tar:
            for m in tar:
                if m.isfile() and m.name.lower().endswith("opencode.exe"):
                    os.makedirs(OPENCODE_RUNTIME_DIR, exist_ok=True)
                    src = tar.extractfile(m)
                    with open(target_tmp, "wb") as out:
                        shutil.copyfileobj(src, out)
                    found = True
                    break
        if not found:
            log("压缩包内未找到 opencode.exe")
            write_status(state="error", version=ver, error="压缩包内未找到 opencode.exe")
            return None
        if os.path.getsize(target_tmp) < 1024 * 1024:
            log("opencode.exe 体积异常")
            write_status(state="error", version=ver, error="opencode.exe 体积异常")
            return None
        os.replace(target_tmp, OPENCODE_RUNTIME_EXE)
        with open(os.path.join(OPENCODE_RUNTIME_DIR, "VERSION"), "w", encoding="utf-8") as f:
            f.write(ver)
        log("opencode 已就绪: %s (v%s)" % (OPENCODE_RUNTIME_EXE, ver))
        write_status(state="ready", version=ver, exe=OPENCODE_RUNTIME_EXE)
        return OPENCODE_RUNTIME_EXE
    except Exception as e:
        log("安装 opencode 二进制失败: %r" % e)
        write_status(state="error", version=ver, error=str(e))
        return None
    finally:
        for p in (tmp, target_tmp):
            try:
                os.remove(p)
            except Exception:
                pass


def npm_cmd():
    return shutil.which("npm.cmd") or shutil.which("npm")


def install_opencode():
    npm = npm_cmd()
    if not npm:
        return None
    write_status(state="installing-npm")
    log("首次运行：npm install -g opencode-ai ...")
    try:
        subprocess.run(
            [npm, "install", "-g", "opencode-ai"],
            check=True, creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=900,
        )
    except Exception as e:
        log("npm install 失败: %r" % e)
        write_status(state="error", error="npm 安装失败: %s" % e)
        return None
    found = find_opencode()
    if found:
        write_status(state="ready", exe=found)
    return found


def start_opencode(exe):
    log("启动 opencode serve :%d" % OPENCODE_PORT)
    env = dict(os.environ)
    args = [exe, "serve", "--port", str(OPENCODE_PORT), "--hostname", "127.0.0.1"]
    if exe.lower().endswith((".cmd", ".bat")):
        args = ["cmd", "/c"] + args
    try:
        return subprocess.Popen(
            args, cwd=DATA_DIR, env=env, creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        log("启动 opencode 失败: %r" % e)
        return None


def wait_port(port, seconds, label):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.3)
    log("等待 %s (:%d) 超时" % (label, port))
    return False


def install_plugin():
    if not os.path.isfile(PLUGIN_SRC):
        log("未找到插件源: %s" % PLUGIN_SRC)
        return
    try:
        os.makedirs(OPENCODE_CONFIG, exist_ok=True)
        registered = False
        try:
            if os.path.isfile(OPENCODE_CONFIG_FILE):
                with open(OPENCODE_CONFIG_FILE, "r", encoding="utf-8") as f:
                    registered = "base-override" in f.read()
        except Exception:
            registered = False
        if registered:
            changed = _copy_if_changed(PLUGIN_SRC, os.path.join(OPENCODE_PLUGIN_COMPAT, "base-override.ts"))
            log("插件%s（沿用 opencode.jsonc 注册的 plugin/）" % ("已更新" if changed else "已是最新"))
        else:
            changed = _copy_if_changed(PLUGIN_SRC, os.path.join(OPENCODE_PLUGIN_AUTO, "base-override.ts"))
            log("插件%s（plugins/ 自动加载）" % ("已安装/更新" if changed else "已是最新"))
    except Exception as e:
        log("安装插件失败: %r" % e)


def pid_listening(port):
    if not IS_WIN:
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
    except Exception as e:
        log("查询端口占用失败: %r" % e)
    return None


def pick_free_port(start, tries=20):
    for p in range(start, start + tries):
        if not port_open(p):
            return p
    return None


def start_front():
    global FRONT_PORT
    cur = app_version()
    info = http_get_json("http://127.0.0.1:%d/api/_version" % FRONT_PORT)
    if info and info.get("version") == cur:
        log("前端已在运行 (v%s)，复用" % cur)
        return None
    if port_open(FRONT_PORT):
        pid = (info or {}).get("pid") or pid_listening(FRONT_PORT)
        image = _proc_image(pid) if pid else None
        if pid and image and _under(image, ROOT):
            log("检测到本程序旧前端 (pid=%s, v%r)，结束并升级到 v%s"
                % (pid, (info or {}).get("version"), cur))
            kill_pid(pid)
            for _ in range(30):
                if not port_open(FRONT_PORT):
                    break
                time.sleep(0.2)
        if port_open(FRONT_PORT):
            alt = pick_free_port(FRONT_PORT + 1)
            if not alt:
                log("端口 %d 被其它程序占用，且未找到可用替代端口" % FRONT_PORT)
                msgbox(
                    "端口 %d 被其它程序占用，且未找到可用端口。\n"
                    "请关闭占用该端口的程序后重新打开本程序。" % FRONT_PORT,
                    "opencode chat 提示", 0x30,
                )
                return None
            log("端口 %d 被其它程序占用，自动改用 %d" % (FRONT_PORT, alt))
            FRONT_PORT = alt
    log("启动 server.py :%d" % FRONT_PORT)
    env = dict(os.environ)
    env["OPENCODE_PORT"] = str(OPENCODE_PORT)
    env["FRONT_PORT"] = str(FRONT_PORT)
    try:
        p = subprocess.Popen(
            [PYTHON, SERVER_PY], cwd=APP_DIR, env=env, creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        log("启动 server.py 失败: %r" % e)
        return None
    wait_port(FRONT_PORT, 20, "server.py")
    return p


def find_edge():
    pf = os.environ.get("ProgramFiles(x86)") or os.environ.get("ProgramFiles") or ""
    local = os.environ.get("LOCALAPPDATA", "")
    for p in [
        os.path.join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
        os.path.join(os.environ.get("ProgramFiles", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
        os.path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]:
        if p and os.path.isfile(p):
            return p
    return None


def open_app():
    url = "http://127.0.0.1:%d/" % FRONT_PORT
    edge = find_edge()
    profile = os.path.join(DATA_DIR, "browser-profile")
    try:
        os.makedirs(profile, exist_ok=True)
    except Exception:
        profile = None
    if edge:
        args = [edge, "--app=" + url, "--no-first-run", "--no-default-browser-check"]
        if profile:
            args.append("--user-data-dir=" + profile)
        try:
            subprocess.Popen(args, creationflags=CREATE_NO_WINDOW)
            return
        except Exception as e:
            log("启动 Edge 失败: %r" % e)
    try:
        os.startfile(url)  # 回退到默认浏览器
    except Exception as e:
        log("打开浏览器失败: %r" % e)
        msgbox("无法打开浏览器，请手动访问：\n" + url)


def main():
    cur = app_version()
    log("launcher start v%s root=%s" % (cur, ROOT))
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
    except Exception:
        pass

    install_plugin()

    exe = find_opencode()
    if exe:
        write_status(state="ready", exe=exe)
        if not port_open(OPENCODE_PORT):
            start_opencode(exe)
            wait_port(OPENCODE_PORT, 25, "opencode")
    else:
        write_status(state="preparing")
        log("未找到 opencode，将在打开界面后尝试自动安装")

    start_front()
    if port_open(FRONT_PORT):
        open_app()
    else:
        log("前端服务未就绪，跳过打开窗口")
        msgbox(
            "前端服务未能启动，未打开界面。\n\n"
            "请查看日志：\n" + os.path.join(LOG_DIR, "launcher.log"),
            "opencode chat 提示", 0x30,
        )

    if not exe:
        exe = install_opencode_binary()
        if not exe:
            exe = install_opencode()
        if exe:
            if not port_open(OPENCODE_PORT):
                start_opencode(exe)
                wait_port(OPENCODE_PORT, 25, "opencode")
        else:
            log("opencode 自动安装失败（二进制下载与 npm 均不可用）")
            write_status(state="error", error="opencode 自动安装失败（二进制下载与 npm 均不可用）")
            msgbox(
                "未能自动下载 opencode 运行组件。\n\n"
                "请检查网络连接后重新打开本程序；\n"
                "也可手动执行：  npm install -g opencode-ai（需已安装 Node.js）\n\n"
                "界面已打开，但暂时无法连接模型。",
                "opencode chat 提示", 0x30,
            )

    log("launcher done")


if __name__ == "__main__":
    main()
