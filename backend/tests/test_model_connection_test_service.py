import json
import unittest
from urllib.error import HTTPError

from app.schemas.model_test import ModelConnectionTestRequest
from app.services.model_connection_test_service import (
    ModelConnectionTestError,
    ModelConnectionTestService,
)
from app.services.model_test_session_store import ModelTestSession


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        return None


class ModelConnectionTestServiceTests(unittest.TestCase):
    def test_uses_doubao_default_endpoint_and_returns_reply(self) -> None:
        captured_request = None

        def sender(request, *, timeout):
            nonlocal captured_request
            captured_request = request
            self.assertEqual(timeout, 20)
            return FakeResponse({"choices": [{"message": {"content": "移项时要改变项的符号，并保持等式两边同时变化。"}}]})

        service = ModelConnectionTestService(http_sender=sender)
        result = service.test_connection(
            ModelConnectionTestRequest(provider="豆包", api_key="ark-test-key", model_name="ep-test-model")
        )

        self.assertEqual(result["provider"], "豆包")
        self.assertIn("移项", result["reply"])
        self.assertEqual(captured_request.full_url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions")

    def test_rejects_non_https_custom_endpoint(self) -> None:
        service = ModelConnectionTestService()

        with self.assertRaisesRegex(ModelConnectionTestError, "HTTPS"):
            service.test_connection(
                ModelConnectionTestRequest(
                    provider="自定义兼容接口",
                    api_key="custom-test-key",
                    model_name="test-model",
                    api_base_url="http://127.0.0.1:9999/v1",
                )
            )

    def test_answers_question_with_temporary_session(self) -> None:
        def sender(request, *, timeout):
            self.assertEqual(timeout, 20)
            request_payload = json.loads(request.data.decode("utf-8"))
            self.assertEqual(request_payload["messages"][-1]["content"], "什么是函数？")
            return FakeResponse({"choices": [{"message": {"content": "函数描述两个量之间的对应关系。"}}]})

        service = ModelConnectionTestService(http_sender=sender)
        result = service.answer_assistant_question(
            ModelTestSession(
                provider="豆包",
                api_key="ark-test-key",
                model_name="ep-test-model",
                api_base_url=None,
            ),
            "什么是函数？",
        )

        self.assertEqual(result["model_name"], "ep-test-model")
        self.assertIn("函数", result["reply"])

    def test_converts_authentication_error_to_safe_message(self) -> None:
        def sender(request, timeout):
            raise HTTPError(request.full_url, 401, "Unauthorized", {}, None)

        service = ModelConnectionTestService(http_sender=sender)

        with self.assertRaisesRegex(ModelConnectionTestError, "鉴权失败"):
            service.test_connection(
                ModelConnectionTestRequest(provider="豆包", api_key="ark-test-key", model_name="ep-test-model")
            )
