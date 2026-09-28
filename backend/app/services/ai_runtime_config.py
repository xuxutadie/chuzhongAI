"""服务端 AI 运行时配置与受控调用。

教师管理账号从 ``Settings`` 读取共享配置；自主注册学生使用独立的加密配置。
响应对象只包含是否启用、服务名和模型名，绝不包含密钥或完整请求内容。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

from app.core.config import Settings, settings
from app.schemas.math_question_generation import (
    MathQuestionGenerationRequest,
    MathQuestionGenerationResponse,
)
from app.services.math_question_generation_service import (
    MathQuestionGenerationError,
    MathQuestionGenerationService,
)
from app.services.model_connection_test_service import (
    ModelConnectionTestError,
    ModelConnectionTestService,
)
from app.services.model_test_session_store import ModelTestSession


class AIRuntimeError(Exception):
    """可安全显示给学习者或教师的 AI 运行时错误。"""

    status_code = 400


class AIConfigurationError(AIRuntimeError):
    """AI/OCR 尚未可用，但学生仍可采用手动流程。"""

    status_code = 409


class AIServiceUnavailableError(AIRuntimeError):
    """外部模型服务暂时不可用，不能泄露供应商错误细节。"""

    status_code = 503


class AIResponseFormatError(AIRuntimeError):
    """外部模型返回的内容不能作为可信学习数据使用。"""

    status_code = 422


@dataclass(frozen=True)
class ProviderRuntimeConfig:
    """单个兼容 OpenAI Chat Completions 服务的服务端配置。"""

    enabled: bool
    provider: str
    api_base_url: str
    api_key: str
    model: str
    capability_name: str
    # 由服务端个人配置解析器设置，客户端不能自行指定费用归属。
    personal: bool = False

    @property
    def configured(self) -> bool:
        """只有开关、服务、地址、密钥和模型都具备时才能向外发送学生数据。"""

        parsed_url = urlparse(self.api_base_url.strip())
        return bool(
            self.enabled
            and self.provider.strip()
            and parsed_url.scheme == "https"
            and parsed_url.netloc
            and self.api_key.strip()
            and self.model.strip()
        )

    def public_status(self) -> dict[str, bool | str | None]:
        """构造可返回浏览器的非敏感状态。"""

        return {
            "enabled": self.enabled,
            "configured": self.configured,
            "provider": self.provider.strip() or None,
            "model": self.model.strip() or None,
        }

    def require_configured(self, *, manual_guidance: str) -> None:
        if self.personal and not self.configured:
            raise AIConfigurationError(
                f"请先在“AI 设置”中配置你自己的{self.capability_name}。"
                "自主注册账号不会使用老师的 API；你仍可以做本地练习或手动整理错题。"
            )
        if not self.enabled:
            raise AIConfigurationError(manual_guidance)
        if not self.configured:
            raise AIConfigurationError(
                f"{self.capability_name}配置不完整，请教师检查服务器 .env 后重试。"
            )

    def as_model_session(self) -> ModelTestSession:
        """仅在服务端内存中构造一次调用会话，不写入数据库。"""

        return ModelTestSession(
            provider=self.provider.strip(),
            api_key=self.api_key,
            model_name=self.model.strip(),
            api_base_url=self.api_base_url.strip(),
        )


class AIRuntimeConfig:
    """从配置对象派生 AI/OCR 的运行时能力边界。"""

    def __init__(self, configured_settings: Settings = settings) -> None:
        self.llm = ProviderRuntimeConfig(
            enabled=configured_settings.llm_enabled,
            provider=configured_settings.llm_provider,
            api_base_url=configured_settings.llm_api_base_url,
            api_key=configured_settings.llm_api_key,
            model=configured_settings.llm_model,
            capability_name="AI 学习服务",
        )
        self.ocr = ProviderRuntimeConfig(
            enabled=configured_settings.ocr_enabled,
            provider=configured_settings.ocr_provider,
            api_base_url=configured_settings.ocr_api_base_url,
            api_key=configured_settings.ocr_api_key,
            model=configured_settings.ocr_model,
            capability_name="OCR 识题服务",
        )

    def public_status(self) -> dict[str, dict[str, bool | str | None]]:
        return {"llm": self.llm.public_status(), "ocr": self.ocr.public_status()}


class AIRuntimeService:
    """为答疑、错因分析和数学变式出题提供同一条受控服务端调用路径。"""

    def __init__(
        self,
        runtime_config: AIRuntimeConfig | None = None,
        completion_service: ModelConnectionTestService | None = None,
    ) -> None:
        self.runtime_config = runtime_config or AIRuntimeConfig()
        self.completion_service = completion_service or ModelConnectionTestService()

    def integration_status(self) -> dict[str, dict[str, bool | str | None]]:
        return self.runtime_config.public_status()

    def answer_assistant_question(self, question: str) -> dict[str, Any]:
        self.runtime_config.llm.require_configured(
            manual_guidance="AI 答疑尚未启用，请先根据教材和老师的提示继续学习，或请教师配置 AI 服务。"
        )
        cleaned_question = question.strip()
        if not cleaned_question:
            raise AIResponseFormatError("请输入需要咨询的问题")
        try:
            result = self.completion_service.answer_assistant_question(
                self.runtime_config.llm.as_model_session(), cleaned_question
            )
        except ModelConnectionTestError as error:
            raise AIServiceUnavailableError("AI 服务暂时不可用，请稍后重试或继续使用教材提示。") from error
        return result

    def analyze_wrong_question(
        self,
        *,
        subject: str,
        question_text: str,
        knowledge_points: list[str],
    ) -> dict[str, Any]:
        """请求结构化错因分析；任何无效模型回复都不会写入学生错题。"""

        self.runtime_config.llm.require_configured(
            manual_guidance="AI 错因分析尚未启用，请先手动填写错因和知识点，或请教师配置 AI 服务。"
        )
        prompt = json.dumps(
            {
                "subject": subject,
                "question_text": question_text,
                "existing_knowledge_points": knowledge_points,
            },
            ensure_ascii=False,
        )
        reply, latency_ms = self._request_json(
            self.runtime_config.llm,
            [
                {
                    "role": "system",
                    "content": (
                        "你是初中学习错题分析助手。只能输出一个 JSON 对象，字段必须为 "
                        "error_reason（字符串）、knowledge_points（字符串数组）和 suggestion（字符串）。"
                        "不要输出 Markdown、题目答案、个人信息或额外字段。"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=700,
        )
        analysis = self._parse_analysis_reply(reply)
        analysis["model_name"] = self.runtime_config.llm.model.strip()
        analysis["latency_ms"] = latency_ms
        return analysis

    def generate_math_variant(
        self,
        request: MathQuestionGenerationRequest,
    ) -> MathQuestionGenerationResponse:
        """生成并校验变式题，正确答案只在服务端登记。"""

        self.runtime_config.llm.require_configured(
            manual_guidance="AI 变式题尚未启用，系统会继续使用已审核的本地题目；如需启用请联系教师配置 AI 服务。"
        )
        try:
            return MathQuestionGenerationService(self.completion_service).generate(
                self.runtime_config.llm.as_model_session(), request
            )
        except (MathQuestionGenerationError, ModelConnectionTestError) as error:
            raise AIServiceUnavailableError("暂时无法生成 AI 变式题，请继续使用已审核的本地题目。") from error

    def _request_json(
        self,
        config: ProviderRuntimeConfig,
        messages: list[dict[str, Any]],
        *,
        max_tokens: int,
    ) -> tuple[str, int]:
        try:
            # 兼容服务支持的 content 既可以是字符串，也可以是视觉消息数组。
            return self.completion_service.request_json_completion(  # type: ignore[arg-type]
                config.as_model_session(), messages, max_tokens
            )
        except ModelConnectionTestError as error:
            raise AIServiceUnavailableError("AI 服务暂时不可用，请稍后重试或采用手动录入。") from error

    @staticmethod
    def _parse_analysis_reply(reply: str) -> dict[str, Any]:
        try:
            payload = json.loads(reply)
        except json.JSONDecodeError as error:
            raise AIResponseFormatError("AI 返回格式无法校验，请手动填写错因和知识点。") from error
        if not isinstance(payload, dict) or set(payload) != {
            "error_reason",
            "knowledge_points",
            "suggestion",
        }:
            raise AIResponseFormatError("AI 返回内容不完整，请手动填写错因和知识点。")
        error_reason = payload.get("error_reason")
        suggestion = payload.get("suggestion")
        knowledge_points = payload.get("knowledge_points")
        if (
            not isinstance(error_reason, str)
            or not error_reason.strip()
            or len(error_reason.strip()) > 500
            or not isinstance(suggestion, str)
            or not suggestion.strip()
            or len(suggestion.strip()) > 1_000
            or not isinstance(knowledge_points, list)
            or len(knowledge_points) > 12
            or any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 80 for item in knowledge_points)
        ):
            raise AIResponseFormatError("AI 返回内容无法作为错题分析，请手动填写。")
        return {
            "error_reason": error_reason.strip(),
            "knowledge_points": [item.strip() for item in knowledge_points],
            "suggestion": suggestion.strip(),
        }
