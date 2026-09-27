import http.client
import json
import os
import socket
import sys
import tempfile
import threading
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import server  # noqa: E402


class ServerSmokeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.Server(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.token = server.SESSION_TOKEN

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def request(self, method, path, body=None, headers=None):
        h = dict(headers or {})
        # 显式短连接：避免 HTTP/1.1 keep-alive 下未读完的请求体引发偶发 WinError 10053。
        h.setdefault("Connection", "close")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request(method, path, body=body, headers=h)
        resp = conn.getresponse()
        data = resp.read()
        result = (resp.status, dict(resp.getheaders()), data)
        conn.close()
        return result

    def auth_headers(self, extra=None):
        h = {"Cookie": "oc_token=%s" % self.token}
        if extra:
            h.update(extra)
        return h

    def test_index_security_headers_and_no_token_injection(self):
        status, headers, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("Content-Security-Policy", headers)
        self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(headers.get("Referrer-Policy"), "no-referrer")
        self.assertNotIn(b"__OC_TOKEN", body)
        self.assertIn("oc_token=", headers.get("Set-Cookie", ""))
        self.assertIn("HttpOnly", headers.get("Set-Cookie", ""))

    def test_api_requires_token(self):
        status, _headers, _body = self.request("POST", "/api/_mkdir", body=b"{}")
        self.assertEqual(status, 403)

    def test_mkdir_with_cookie(self):
        target = tempfile.mkdtemp(prefix="oc-test-")
        path = os.path.join(target, "sub")
        body = json.dumps({"path": path}).encode("utf-8")
        status, _headers, _body = self.request(
            "POST",
            "/api/_mkdir",
            body=body,
            headers=self.auth_headers({"Content-Type": "application/json"}),
        )
        self.assertEqual(status, 200)
        self.assertTrue(os.path.isdir(path))

    def test_move_requires_token(self):
        status, _headers, _body = self.request("POST", "/api/_move", body=b"{}")
        self.assertEqual(status, 403)

    def test_app_restart_requires_token(self):
        status, _headers, _body = self.request("POST", "/api/_app/restart", body=b"{}")
        self.assertEqual(status, 403)

    def test_app_restart_rejects_get(self):
        status, _headers, _body = self.request(
            "GET", "/api/_app/restart", headers=self.auth_headers())
        self.assertEqual(status, 405)

    def test_app_restart_spawns_opencode_and_helper(self):
        calls = {}
        orig_oc = server.restart_opencode
        orig_spawn = server.spawn_app_restart
        server.restart_opencode = lambda: {"ok": True}
        server.spawn_app_restart = lambda port=None, pid=None: calls.update(port=port, pid=pid) or True
        try:
            status, _headers, body = self.request(
                "POST", "/api/_app/restart", body=b"{}", headers=self.auth_headers())
            self.assertEqual(status, 200)
            data = json.loads(body)
            self.assertTrue(data["ok"])
            self.assertTrue(data["middle"])
            self.assertEqual(calls.get("port"), server.LISTEN_PORT)
            self.assertIsNotNone(calls.get("pid"))
        finally:
            server.restart_opencode = orig_oc
            server.spawn_app_restart = orig_spawn

    def test_opencode_is_managed_detects_marker(self):
        orig_img, orig_cmd = server.pid_image_name, server.pid_command_line
        server.pid_image_name = lambda pid: "opencode.exe"
        try:
            server.pid_command_line = (
                lambda pid: '"C:\\x\\opencode.exe" serve --port 4096 --hostname 127.0.0.1')
            self.assertTrue(server.opencode_is_managed(1234))
            server.pid_command_line = lambda pid: '"C:\\x\\opencode.exe" serve --port 4096'
            self.assertFalse(server.opencode_is_managed(1234))
            # 取不到命令行时不误判为未托管
            server.pid_command_line = lambda pid: ""
            self.assertTrue(server.opencode_is_managed(1234))
            # 非 opencode 进程不处理
            server.pid_image_name = lambda pid: "python.exe"
            self.assertTrue(server.opencode_is_managed(1234))
        finally:
            server.pid_image_name, server.pid_command_line = orig_img, orig_cmd

    def test_ensure_managed_opencode_restarts_unmanaged(self):
        orig = (server.port_owner_pid, server.pid_image_name,
                server.pid_command_line, server.restart_opencode)
        calls = []
        server.port_owner_pid = lambda port: 999
        server.pid_image_name = lambda pid: "opencode.exe"
        server.pid_command_line = lambda pid: '"C:\\x\\opencode.exe" serve --port 4096'
        server.restart_opencode = lambda: calls.append(True) or {"ok": True}
        try:
            server.ensure_managed_opencode()
            self.assertEqual(len(calls), 1)
        finally:
            (server.port_owner_pid, server.pid_image_name,
             server.pid_command_line, server.restart_opencode) = orig

    def test_ensure_managed_opencode_keeps_managed(self):
        orig = (server.port_owner_pid, server.pid_image_name,
                server.pid_command_line, server.restart_opencode)
        calls = []
        server.port_owner_pid = lambda port: 999
        server.pid_image_name = lambda pid: "opencode.exe"
        server.pid_command_line = (
            lambda pid: '"C:\\x\\opencode.exe" serve --port 4096 --hostname 127.0.0.1')
        server.restart_opencode = lambda: calls.append(True) or {"ok": True}
        try:
            server.ensure_managed_opencode()
            self.assertEqual(calls, [])
        finally:
            (server.port_owner_pid, server.pid_image_name,
             server.pid_command_line, server.restart_opencode) = orig

    def test_move_directory_with_cookie(self):
        src = tempfile.mkdtemp(prefix="oc-move-src-")
        with open(os.path.join(src, "a.txt"), "w", encoding="utf-8") as f:
            f.write("hi")
        dst = os.path.join(tempfile.mkdtemp(prefix="oc-move-dst-"), "moved")
        body = json.dumps({"src": src, "dst": dst}).encode("utf-8")
        status, _headers, _body = self.request(
            "POST", "/api/_move", body=body,
            headers=self.auth_headers({"Content-Type": "application/json"}),
        )
        self.assertEqual(status, 200)
        self.assertTrue(os.path.isfile(os.path.join(dst, "a.txt")))
        self.assertFalse(os.path.isdir(src))

    def test_move_creates_missing_source_dir(self):
        parent = tempfile.mkdtemp(prefix="oc-move-new-")
        src = os.path.join(parent, "not-there")
        dst = os.path.join(parent, "made")
        body = json.dumps({"src": src, "dst": dst}).encode("utf-8")
        status, _headers, _body = self.request(
            "POST", "/api/_move", body=body,
            headers=self.auth_headers({"Content-Type": "application/json"}),
        )
        self.assertEqual(status, 200)
        self.assertTrue(os.path.isdir(dst))

    def test_models_endpoint_removed(self):
        status, _headers, _body = self.request("GET", "/api/_models", headers=self.auth_headers())
        self.assertEqual(status, 404)

    def test_blocked_proxy_path_is_404(self):
        status, _headers, _body = self.request("GET", "/api/auth", headers=self.auth_headers())
        self.assertEqual(status, 404)

    def test_file_content_proxy_allowed(self):
        # 电脑文件浏览需要读文件内容：/file 与 /file/content 必须在放行名单内。
        self.assertIn("/file", server.PROXY_ALLOW_EXACT)
        self.assertIn("/file/content", server.PROXY_ALLOW_EXACT)

    def test_drives_endpoint(self):
        status, _headers, body = self.request("GET", "/api/_drives", headers=self.auth_headers())
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(isinstance(data.get("drives"), list))

    def test_path_traversal_blocked(self):
        status, _headers, _body = self.request("GET", "/../server.py")
        self.assertEqual(status, 404)

    def test_vendor_font_mime(self):
        status, headers, body = self.request("GET", "/vendor/fonts/KaTeX_Main-Regular.woff2")
        self.assertEqual(status, 200)
        self.assertIn("font/woff2", headers.get("Content-Type", ""))
        self.assertGreater(len(body), 0)

    def test_profile_roundtrip(self):
        orig = server.PROFILE_FILE
        fd, path = tempfile.mkstemp(prefix="oc-profile-", suffix=".json")
        os.close(fd)
        os.remove(path)
        server.PROFILE_FILE = path
        try:
            status, _headers, _body = self.request("POST", "/api/_profile", body=b'{"data":{}}')
            self.assertEqual(status, 403)
            payload = json.dumps({"data": {"oc_theme": "dark"}}).encode("utf-8")
            status, _headers, _body = self.request(
                "POST", "/api/_profile", body=payload,
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 200)
            status, _headers, body = self.request("GET", "/api/_profile", headers=self.auth_headers())
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["data"]["oc_theme"], "dark")
        finally:
            server.PROFILE_FILE = orig
            if os.path.isfile(path):
                os.remove(path)

    def test_remote_status_public_local(self):
        status, _headers, body = self.request("GET", "/api/_remote/status")
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(data["ok"])
        self.assertFalse(data["remote"])
        self.assertTrue(data["authed"])

    def test_password_hash_roundtrip(self):
        stored = server.hash_password("hunter2")
        self.assertTrue(stored.startswith("pbkdf2$"))
        self.assertTrue(server.verify_password("hunter2", stored))
        self.assertFalse(server.verify_password("wrong", stored))
        self.assertFalse(server.verify_password("hunter2", "garbage"))

    def test_remote_admin_toggle(self):
        orig = server.REMOTE_FILE
        fd, path = tempfile.mkstemp(prefix="oc-remote-", suffix=".json")
        os.close(fd)
        os.remove(path)
        server.REMOTE_FILE = path
        try:
            status, _headers, body = self.request("GET", "/api/_remote", headers=self.auth_headers())
            self.assertEqual(status, 200)
            self.assertFalse(json.loads(body)["enabled"])

            payload = json.dumps({"enabled": True, "password": "abcd"}).encode("utf-8")
            status, _headers, body = self.request(
                "POST", "/api/_remote", body=payload,
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(body)["enabled"])
            self.assertTrue(server.remote_enabled())

            status, _headers, body = self.request("GET", "/api/_remote/status")
            self.assertTrue(json.loads(body)["enabled"])

            payload = json.dumps({"clearPassword": True}).encode("utf-8")
            status, _headers, body = self.request(
                "POST", "/api/_remote", body=payload,
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 200)
            self.assertFalse(server.remote_enabled())
        finally:
            server.REMOTE_FILE = orig
            if os.path.isfile(path):
                os.remove(path)

    def test_server_port_config(self):
        orig = server.SERVER_FILE
        fd, path = tempfile.mkstemp(prefix="oc-server-", suffix=".json")
        os.close(fd)
        os.remove(path)
        server.SERVER_FILE = path
        try:
            status, _headers, body = self.request("GET", "/api/_server", headers=self.auth_headers())
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["active"], server.LISTEN_PORT)

            status, _headers, _body = self.request(
                "POST", "/api/_server", body=b'{"port": 700000}',
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 400)

            probe = socket.socket()
            probe.bind(("127.0.0.1", 0))
            free = probe.getsockname()[1]
            probe.close()
            status, _headers, body = self.request(
                "POST", "/api/_server", body=json.dumps({"port": free}).encode(),
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body)["port"], free)

            busy_sock = socket.socket()
            busy_sock.bind(("127.0.0.1", 0))
            busy_sock.listen(1)
            busy = busy_sock.getsockname()[1]
            status, _headers, _body = self.request(
                "POST", "/api/_server", body=json.dumps({"port": busy}).encode(),
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 409)
            busy_sock.close()
        finally:
            server.SERVER_FILE = orig
            if os.path.isfile(path):
                os.remove(path)

    def test_remote_enable_requires_password(self):
        orig = server.REMOTE_FILE
        fd, path = tempfile.mkstemp(prefix="oc-remote-", suffix=".json")
        os.close(fd)
        os.remove(path)
        server.REMOTE_FILE = path
        try:
            payload = json.dumps({"enabled": True}).encode("utf-8")
            status, _headers, _body = self.request(
                "POST", "/api/_remote", body=payload,
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 400)
            self.assertFalse(server.remote_enabled())
        finally:
            server.REMOTE_FILE = orig
            if os.path.isfile(path):
                os.remove(path)

    # ---------- 本地模型（llama.cpp / GGUF） ----------

    def test_gguf_alias(self):
        self.assertEqual(server.gguf_alias("D:\\m\\Qwen2.5-7B.Q4_K_M.gguf"), "Qwen2.5-7B.Q4_K_M")
        self.assertEqual(server.gguf_alias("/x/my model.gguf"), "my-model")
        self.assertEqual(server.gguf_alias(""), "local-model")
        self.assertEqual(server.gguf_alias("....gguf"), "local-model")
        self.assertEqual(len(server.gguf_alias("a" * 100 + ".gguf")), 64)

    def test_local_server_args(self):
        cfg = {"modelPath": "C:\\m\\a.gguf", "port": 8787, "ctx": 4096,
               "gpuLayers": -1, "threads": 4, "jinja": True, "extraArgs": "--flash-attn"}
        args = server.local_server_args("llama-server.exe", cfg, "a", True)
        self.assertEqual(args[0], "llama-server.exe")
        self.assertIn("-m", args)
        self.assertIn("C:\\m\\a.gguf", args)
        self.assertIn("8787", args)
        self.assertIn("4096", args)
        self.assertIn("--jinja", args)
        self.assertIn("--flash-attn", args)
        # GPU 层数自动：CUDA 全部 / CPU 为 0
        self.assertEqual(args[args.index("-ngl") + 1], "999")
        cpu = server.local_server_args("x", cfg, "a", False)
        self.assertEqual(cpu[cpu.index("-ngl") + 1], "0")
        # 显式层数
        cfg2 = dict(cfg, gpuLayers=20)
        a2 = server.local_server_args("x", cfg2, "a", True)
        self.assertEqual(a2[a2.index("-ngl") + 1], "20")
        # 关闭 jinja / 线程为 0 时不带对应参数
        cfg3 = dict(cfg, jinja=False, threads=0, extraArgs="")
        a3 = server.local_server_args("x", cfg3, "a", False)
        self.assertNotIn("--jinja", a3)
        self.assertNotIn("-t", a3)

    def test_local_endpoint_requires_token(self):
        status, _headers, _body = self.request("GET", "/api/_local")
        self.assertEqual(status, 403)
        status, _headers, _body = self.request("POST", "/api/_local/start")
        self.assertEqual(status, 403)
        status, _headers, _body = self.request("POST", "/api/_local/install")
        self.assertEqual(status, 403)

    def test_local_status_shape(self):
        status, _headers, body = self.request("GET", "/api/_local", headers=self.auth_headers())
        self.assertEqual(status, 200)
        data = json.loads(body)
        self.assertTrue(data["ok"])
        self.assertIn("running", data)
        self.assertIn("installed", data["runtime"])
        self.assertIn("nvidia", data)

    def test_local_config_roundtrip(self):
        orig = server.LOCAL_FILE
        fd, path = tempfile.mkstemp(prefix="oc-local-", suffix=".json")
        os.close(fd)
        os.remove(path)
        server.LOCAL_FILE = path
        try:
            payload = json.dumps({"enabled": True, "ctx": 4096, "port": 8790,
                                  "modelPath": "C:\\m\\a.gguf"}).encode("utf-8")
            status, _headers, body = self.request(
                "POST", "/api/_local", body=payload,
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 200)
            cfg = json.loads(body)["config"]
            self.assertTrue(cfg["enabled"])
            self.assertEqual(cfg["ctx"], 4096)
            self.assertEqual(cfg["port"], 8790)
            self.assertEqual(cfg["modelPath"], "C:\\m\\a.gguf")

            status, _headers, body = self.request("GET", "/api/_local", headers=self.auth_headers())
            self.assertTrue(json.loads(body)["config"]["enabled"])

            status, _headers, _body = self.request(
                "POST", "/api/_local", body=b'{"port": 700000}',
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 400)
            status, _headers, _body = self.request(
                "POST", "/api/_local",
                body=json.dumps({"port": server.UPSTREAM_PORT}).encode(),
                headers=self.auth_headers({"Content-Type": "application/json"}),
            )
            self.assertEqual(status, 400)
        finally:
            server.LOCAL_FILE = orig
            if os.path.isfile(path):
                os.remove(path)


if __name__ == "__main__":
    unittest.main()
