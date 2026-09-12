import http.client
import json
import os
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
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request(method, path, body=body, headers=headers or {})
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

    def test_models_endpoint_removed(self):
        status, _headers, _body = self.request("GET", "/api/_models", headers=self.auth_headers())
        self.assertEqual(status, 404)

    def test_blocked_proxy_path_is_404(self):
        status, _headers, _body = self.request("GET", "/api/auth", headers=self.auth_headers())
        self.assertEqual(status, 404)

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


if __name__ == "__main__":
    unittest.main()
