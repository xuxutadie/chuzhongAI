"""OpenAI 兼容视觉识题服务。

识别结果只作为待确认候选内容，绝不会自动写成学生错题或伪造识别结果。
"""

from __future__ import annotations

import base64
import json
from typing import Any

from app.services.ai_runtime_config import (
    AIResponseFormatError,
    AIServiceUnavailableError,
    AIRuntimeConfig,
    ProviderRuntimeConfig,
)
from app.services.model_connection_test_service import (
    ModelConnectionTestError,
    ModelConnectionTestService,
)


class OCRService:
    """仅支持明确配置的 OpenAI 兼容视觉接口。"""

    _supported_providers = {
        "openai_compatible_vision",
        "openai-compatible-vision",
        "openai_compatible",
    }

    def __init__(
        self,
        runtime_config: AIRuntimeConfig | None = None,
        completion_service: ModelConnectionTestService | None = None,
    ) -> None:
        self.runtime_config = runtime_config or AIRuntimeConfig()
        self.completion_service = completion_service or ModelConnectionTestService()

    def recognize(self, *, image_bytes: bytes, media_type: str) -> dict[str, Any]:
        config = self.runtime_config.ocr
        config.require_configured(
            manual_guidance="OCR 识题尚未启用，请手动录入题目，或请教师在服务器配置中启用 OCR 服务。"
        )
        if config.provider.strip().lower() not in self._supported_providers:
            raise AIResponseFormatError(
                "当前 OCR 服务类型暂不支持，请教师配置 OpenAI 兼容视觉接口，或改用手动录入。"
            )
        encoded_image = base64.b64encode(image_bytes).decode("ascii")
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    "你是初中题目图片识别助手。只能输出一个 JSON 对象，字段必须为 "
                    "question_text（字符串）、formulas（字符串数组）、diagram_description（字符串或 null）。"
                    "逐字识别题干和公式；看不清时不要猜测。不要输出 Markdown 或额外字段。"
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "请识别这张错题图片。"},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{encoded_image}",
                            "detail": "high",
                        },
                    },
                ],
            },
        ]
        try:
            reply, latency_ms = self.completion_service.request_json_completion(  # type: ignore[arg-type]
                config.as_model_session(), messages, 1_200
            )
        except ModelConnectionTestError as error:
            raise AIServiceUnavailableError("OCR 服务暂时不可用，请手动录入题目后继续。") from error
        result = self._parse_reply(reply)
        result["model_name"] = config.model.strip()
        result["latency_ms"] = latency_ms
        return result

    @staticmethod
    def _parse_reply(reply: str) -> dict[str, Any]:
        try:
            payload = json.loads(reply)
        except json.JSONDecodeError as error:
            raise AIResponseFormatError("OCR 返回格式无法校验，请手动录入题目。") from error
        if not isinstance(payload, dict) or set(payload) != {
            "question_text",
            "formulas",
            "diagram_description",
        }:
            raise AIResponseFormatError("OCR 返回内容不完整，请手动录入题目。")
        question_text = payload.get("question_text")
        formulas = payload.get("formulas")
        diagram_description = payload.get("diagram_description")
        if (
            not isinstance(question_text, str)
            or not question_text.strip()
            or len(question_text.strip()) > 4_000
            or not isinstance(formulas, list)
            or len(formulas) > 24
            or any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 500 for item in formulas)
            or (
                diagram_description is not None
                and (
                    not isinstance(diagram_description, str)
                    or len(diagram_description.strip()) > 2_000
                )
            )
        ):
            raise AIResponseFormatError("OCR 返回内容无法确认，请手动录入题目。")
        return {
            "question_text": question_text.strip(),
            "formulas": [item.strip() for item in formulas],
            "diagram_description": diagram_description.strip() if isinstance(diagram_description, str) and diagram_description.strip() else None,
        }
