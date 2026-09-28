import json
import unittest

from app.schemas.math_question_generation import MathQuestionGenerationRequest
from app.services.math_question_generation_service import (
    MathQuestionGenerationError,
    MathQuestionGenerationService,
)
from app.services.model_test_session_store import ModelTestSession


SESSION = ModelTestSession(
    provider="豆包",
    api_key="ark-test-key",
    model_name="ep-test-model",
    api_base_url=None,
)


def valid_question(**changes):
    question = {
        "id": "ai-solid-101",
        "knowledge_point_id": "g7u-shapes-solid",
        "capability_tag": "结构计数",
        "difficulty": "advanced",
        "response_type": "single-choice",
        "prompt": "观察图形，正方体有多少条棱？",
        "options": [
            {"id": "a", "text": "6条"},
            {"id": "b", "text": "8条"},
            {"id": "c", "text": "12条"},
            {"id": "d", "text": "16条"},
        ],
        "correct_answer": "c",
        "explanation": "正方体共有12条棱。",
        "visual": {"kind": "solid-model", "solid": "cube"},
        "source": "ai-generated",
    }
    question.update(changes)
    return question


class FakeCompletionService:
    def __init__(self, reply):
        self.reply = reply
        self.messages = None

    def request_json_completion(self, session, messages, max_tokens):
        self.messages = messages
        return self.reply, 42


class MathQuestionGenerationServiceTests(unittest.TestCase):
    def setUp(self):
        self.request = MathQuestionGenerationRequest(
            knowledge_point_id="g7u-shapes-solid",
            capability_tag="结构计数",
            difficulty="advanced",
            response_type="single-choice",
            excluded_question_ids=["solid-01"],
            weakness_reason="容易混淆棱和顶点",
        )

    def generate(self, payload):
        completion = FakeCompletionService(payload)
        result = MathQuestionGenerationService(completion).generate(SESSION, self.request)
        self.assertIn("只输出一个 JSON 对象", completion.messages[0]["content"])
        return result

    def test_accepts_valid_generated_question(self):
        result = self.generate(json.dumps(valid_question(), ensure_ascii=False))
        self.assertEqual(result.question.id, "ai-solid-101")
        self.assertEqual(result.model_name, "ep-test-model")
        self.assertEqual(result.latency_ms, 42)

    def test_rejects_markdown_fenced_json(self):
        payload = f"```json\n{json.dumps(valid_question(), ensure_ascii=False)}\n```"
        with self.assertRaises(MathQuestionGenerationError):
            self.generate(payload)

    def test_rejects_unknown_visual_kind(self):
        payload = json.dumps(valid_question(visual={"kind": "freehand-svg"}), ensure_ascii=False)
        with self.assertRaises(MathQuestionGenerationError):
            self.generate(payload)

    def test_rejects_answer_outside_options(self):
        payload = json.dumps(valid_question(correct_answer="z"), ensure_ascii=False)
        with self.assertRaises(MathQuestionGenerationError):
            self.generate(payload)

    def test_rejects_duplicate_or_mismatched_question(self):
        duplicate_request = self.request.model_copy(
            update={"excluded_question_ids": ["ai-solid-101"]}
        )
        completion = FakeCompletionService(json.dumps(valid_question(), ensure_ascii=False))
        with self.assertRaises(MathQuestionGenerationError):
            MathQuestionGenerationService(completion).generate(SESSION, duplicate_request)

        mismatch = json.dumps(
            valid_question(knowledge_point_id="g7u-shapes-folding"),
            ensure_ascii=False,
        )
        with self.assertRaises(MathQuestionGenerationError):
            self.generate(mismatch)


if __name__ == "__main__":
    unittest.main()
