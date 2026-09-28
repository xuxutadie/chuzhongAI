import json

from pydantic import ValidationError

from app.schemas.math_question_generation import (
    GeneratedMathQuestion,
    MathQuestionGenerationRequest,
    MathQuestionGenerationResponse,
)
from app.services.model_connection_test_service import ModelConnectionTestService
from app.services.model_test_session_store import ModelTestSession


class MathQuestionGenerationError(Exception):
    """模型变式题未通过系统的确定性校验。"""


class MathQuestionGenerationService:
    """只接收结构化题目，不执行模型生成的代码或标记内容。"""

    def __init__(self, completion_service: ModelConnectionTestService) -> None:
        self.completion_service = completion_service

    def generate(
        self,
        session: ModelTestSession,
        request: MathQuestionGenerationRequest,
    ) -> MathQuestionGenerationResponse:
        messages = [
            {
                "role": "system",
                "content": (
                    "你是北师大版七年级数学命题助手。只输出一个 JSON 对象，不要 Markdown、解释前缀、"
                    "HTML、SVG、JavaScript 或其他代码。字段必须是 id、knowledge_point_id、"
                    "capability_tag、difficulty、response_type、prompt、options、correct_answer、"
                    "explanation、visual、source。source 固定为 ai-generated。visual.kind 只能是 "
                    "solid-model、folding-net、cross-section、orthographic-view；不能创造新渲染器。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(request.model_dump(), ensure_ascii=False),
            },
        ]
        reply, latency_ms = self.completion_service.request_json_completion(
            session,
            messages,
            max_tokens=1400,
        )

        try:
            if reply.lstrip().startswith("```"):
                raise ValueError("不接受 Markdown 围栏")
            raw_question = json.loads(reply)
            if not isinstance(raw_question, dict):
                raise ValueError("题目必须是 JSON 对象")
            question = GeneratedMathQuestion.model_validate(raw_question)
        except (json.JSONDecodeError, ValidationError, ValueError, TypeError) as error:
            raise MathQuestionGenerationError("模型生成的题目未通过格式和答案校验") from error

        if (
            question.id in request.excluded_question_ids
            or question.knowledge_point_id != request.knowledge_point_id
            or question.capability_tag != request.capability_tag
            or question.difficulty != request.difficulty
            or question.response_type != request.response_type
        ):
            raise MathQuestionGenerationError("模型生成的题目与本次学习要求不一致")

        return MathQuestionGenerationResponse(
            question=question,
            model_name=session.model_name,
            latency_ms=latency_ms,
        )
