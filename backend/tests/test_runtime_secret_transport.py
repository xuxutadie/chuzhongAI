"""带密钥的模型请求必须拒绝重定向，避免把密钥发送到第二个站点。"""

import unittest
from urllib.error import HTTPError
from urllib.request import Request

from app.services import model_connection_test_service as transport


class RuntimeSecretTransportTests(unittest.TestCase):
    def test_redirect_is_blocked_before_creating_a_second_request(self):
        handler = transport.NoCredentialRedirectHandler()
        request = Request("https://api.openai.com/v1/chat/completions", data=b"{}",
                          headers={"Authorization": "Bearer test-only-key"})
        for status_code in (301, 302, 303, 307, 308):
            with self.subTest(status=status_code):
                with self.assertRaises(HTTPError) as caught:
                    handler.redirect_request(request, None, status_code, "redirect", {},
                                             "https://another.example/chat/completions")
                caught.exception.close()
