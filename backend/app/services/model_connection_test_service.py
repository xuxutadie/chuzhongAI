import json
import time
from collections.abc import Callable
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.schemas.model_test import ModelConnectionTestRequest
from app.services.model_test_session_store import ModelTestSession


class HttpResponse(Protocol):
    def read(self) -> bytes:
        """读取响应内容。"""

    def __enter__(self) -> "HttpResponse":
        """进入响应上下文。"""

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        """退出响应上下文。"""


HttpSender = Callable[[Request, float], HttpResponse]


class ModelConnectionTestError(Exception):
    """模型连通性测试失败。"""


class NoCredentialRedirectHandler(HTTPRedirectHandler):
    """带密钥的模型请求不跟随重定向，避免授权头泄露到另一个地址。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise HTTPError(req.full_url, code, "模型服务不允许重定向", headers, fp)


class ModelConnectionTestService:
    """仅用于开发环境的临时模型连接测试，不保存用户密钥。"""

    default_base_urls = {
        "通义千问": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "豆包": "https://ark.cn-beijing.volces.com/api/v3",
        "DeepSeek": "https://api.deepseek.com/v1",
        "OpenAI": "https://api.openai.com/v1",
        "腾讯混元": "https://api.hunyuan.cloud.tencent.com/v1",
    }
    timeout_seconds = 20

    def __init__(self, http_sender: HttpSender | None = None) -> None:
        self.http_sender = http_sender or build_opener(NoCredentialRedirectHandler()).open

    def test_connection(self, payload: ModelConnectionTestRequest) -> dict[str, Any]:
        reply, elapsed_ms = self._request_completion(
            provider=payload.provider,
            api_key=payload.api_key,
            model_name=payload.model_name,
            api_base_url=payload.api_base_url,
            messages=[
                {
                    "role": "system",
                    "content": "你是一名初中数学学习教练。回答应简洁、准确，不直接展开长篇答案。",
                },
                {
                    "role": "user",
                    "content": "测试题：解一元一次方程时，移项最需要注意什么？请用两句话回答。",
                },
            ],
            max_tokens=160,
        )
        return {
            "provider": payload.provider,
            "model_name": payload.model_name,
            "reply": reply,
            "latency_ms": elapsed_ms,
        }

    def answer_assistant_question(self, session: ModelTestSession, question: str) -> dict[str, Any]:
        """使用经过连通性校验的临时凭据回答一个学生问题。"""

        reply, elapsed_ms = self._request_completion(
            provider=session.provider,
            api_key=session.api_key,
            model_name=session.model_name,
            api_base_url=session.api_base_url,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "你是初中学习教练，采用教师式引导。先判断知识点，再给出能让学生继续思考的"
                        "分步骤提示；除非学生明确要求核对答案，否则不要直接给出完整答案。"
                    ),
                },
                {"role": "user", "content": question.strip()},
            ],
            max_tokens=800,
        )
        return {
            "model_name": session.model_name,
            "reply": reply,
            "latency_ms": elapsed_ms,
        }

    def request_json_completion(
        self,
        session: ModelTestSession,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> tuple[str, int]:
        """使用已验证的临时会话请求结构化内容，不保存密钥或提示词。"""

        return self._request_completion(
            provider=session.provider,
            api_key=session.api_key,
            model_name=session.model_name,
            api_base_url=session.api_base_url,
            messages=messages,
            max_tokens=max_tokens,
        )

    def _request_completion(
        self,
        *,
        provider: str,
        api_key: str,
        model_name: str,
        api_base_url: str | None,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> tuple[str, int]:
        base_url = self._resolve_base_url(provider, api_base_url)
        request = Request(
            url=f"{base_url}/chat/completions",
            data=json.dumps(
                {
                    "model": model_name,
                    "messages": messages,
                    "temperature": 0.2,
                    "max_tokens": max_tokens,
                    "stream": False,
                }
            ).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        started_at = time.perf_counter()

        try:
            with self.http_sender(request, timeout=self.timeout_seconds) as response:
                response_body = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            # HTTPError 也可能持有可关闭的响应流；关闭后再转换为安全提示，
            # 避免模型服务连续鉴权失败时在进程中遗留连接资源。
            try:
                message = self._get_http_error_message(error)
            finally:
                error.close()
            raise ModelConnectionTestError(message) from error
        except (OSError, TimeoutError, URLError) as error:
            raise ModelConnectionTestError("无法连接模型服务，请检查网络、接口地址和服务状态") from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ModelConnectionTestError("模型服务返回了无法解析的响应") from error

        reply = self._extract_reply(response_body)
        elapsed_ms = round((time.perf_counter() - started_at) * 1000)
        return reply, elapsed_ms

    def _resolve_base_url(self, provider: str, api_base_url: str | None) -> str:
        base_url = (api_base_url or self.default_base_urls.get(provider, "")).strip().rstrip("/")
        parsed_url = urlparse(base_url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise ModelConnectionTestError("接口地址必须是有效的 HTTPS 地址")
        return base_url

    @staticmethod
    def _extract_reply(response_body: dict[str, Any]) -> str:
        try:
            content = response_body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise ModelConnectionTestError("模型服务未返回可用回答，请检查模型名称或推理接入点") from error

        if not isinstance(content, str) or not content.strip():
            raise ModelConnectionTestError("模型服务返回了空回答，请检查模型名称或推理接入点")
        return content.strip()[:1200]

    @staticmethod
    def _get_http_error_message(error: HTTPError) -> str:
        if error.code in {401, 403}:
            return "鉴权失败，请检查 API Key 是否有效且具备该模型权限"
        if error.code == 404:
            return "未找到模型服务，请检查接口地址、模型名称或推理接入点"
        if error.code == 429:
            return "模型服务限流或额度不足，请稍后重试"
        return f"模型服务返回错误（HTTP {error.code}）"
