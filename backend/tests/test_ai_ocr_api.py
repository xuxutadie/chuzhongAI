"""AI/OCR 与错题闭环的接口契约测试。

这些测试只使用临时 SQLite 数据库，不会读取真实 .env 或访问外部模型服务。
"""

from __future__ import annotations

import asyncio
import tempfile
import unittest
from pathlib import Path
import json
import sqlite3
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes.ai_learning import (
    get_ai_runtime_service,
    get_ocr_service,
    read_limited_upload_body,
)
from app.api.routes.student_workspace import get_student_workspace_service
from app.core.config import Settings
from app.main import app
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.schemas.math_question_generation import MathQuestionGenerationResponse
from app.services.ai_runtime_config import AIRuntimeConfig, AIRuntimeService
from app.services.model_connection_test_service import ModelConnectionTestService
from app.services.ocr_service import OCRService
from app.services.student_workspace_service import (
    AIRequestRateLimitError,
    MAX_WRONG_QUESTION_IMAGE_BYTES,
    PayloadTooLargeError,
    StudentWorkspaceService,
)


class AIOcrApiTests(unittest.TestCase):
    def setUp(self) -> None:
        StudentWorkspaceService._clear_ai_request_limits_for_testing()
        self.temporary_directory = tempfile.TemporaryDirectory()
        repository = StudentWorkspaceRepository(
            Path(self.temporary_directory.name) / "student-workspace.db"
        )
        self.repository = repository
        workspace_service = StudentWorkspaceService(repository, session_ttl_hours=12)
        self.workspace_service = workspace_service
        app.dependency_overrides[get_student_workspace_service] = lambda: workspace_service
        self.client = TestClient(app)
        teacher = self.client.post(
            "/api/v1/auth/bootstrap",
            json={
                "username": "teacher-admin",
                "password": "safe-password-123",
                "display_name": "王老师",
            },
        )
        self.assertEqual(teacher.status_code, 201)
        self.teacher_headers = self.authorization(teacher.json()["access_token"])
        self.create_student("student-one", "学生一号")
        self.create_student("student-two", "学生二号")
        self.student_headers = self.authorization(self.login("student-one"))
        self.second_student_headers = self.authorization(self.login("student-two"))

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        StudentWorkspaceService._clear_ai_request_limits_for_testing()
        self.temporary_directory.cleanup()

    @staticmethod
    def authorization(access_token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {access_token}"}

    def create_student(self, username: str, display_name: str) -> None:
        response = self.client.post(
            "/api/v1/teacher/students",
            headers=self.teacher_headers,
            json={
                "username": username,
                "password": "safe-password-123",
                "display_name": display_name,
                "grade": "初一",
            },
        )
        self.assertEqual(response.status_code, 201)

    def login(self, username: str) -> str:
        response = self.client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "safe-password-123"},
        )
        self.assertEqual(response.status_code, 200)
        access_token = response.json()["access_token"]
        # 与真实学生先选课程的流程保持一致，变式题和当天数学诊断才有可信范围。
        selected = self.client.put(
            "/api/v1/me/course-context",
            headers=self.authorization(access_token),
            json={
                "course_id": "nnu-math-g7-upper",
                "chapter_id": "g7u-chapter-1",
                "knowledge_point_ids": ["g7u-shapes-solid"],
            },
        )
        self.assertEqual(selected.status_code, 200)
        return access_token

    def upload_image(self, headers: dict[str, str] | None = None) -> str:
        response = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={**(headers or self.student_headers), "Content-Type": "image/png"},
            content=b"\x89PNG\r\n\x1a\nstudent-question-image",
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["upload_id"]

    def test_current_user_can_only_see_non_sensitive_integration_status(self) -> None:
        response = self.client.get(
            "/api/v1/me/integrations",
            headers=self.student_headers,
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["llm"]["enabled"], False)
        self.assertEqual(payload["ocr"]["configured"], False)
        self.assertIsNone(payload["llm"]["provider"])
        self.assertNotIn("api_key", str(payload).lower())
        self.assertNotIn("secret", str(payload).lower())

    def test_teacher_integration_status_is_not_available_to_student(self) -> None:
        blocked = self.client.get(
            "/api/v1/teacher/ai-config/status",
            headers=self.student_headers,
        )
        teacher = self.client.get(
            "/api/v1/teacher/ai-config/status",
            headers=self.teacher_headers,
        )

        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(teacher.status_code, 200)

    def test_non_https_runtime_endpoint_never_counts_as_configured(self) -> None:
        runtime_config = AIRuntimeConfig(
            Settings(
                llm_enabled=True,
                llm_provider="自定义兼容接口",
                llm_api_base_url="http://127.0.0.1:8000/v1",
                llm_api_key="test-llm-secret-key",
                llm_model="coach-test-model",
            )
        )

        self.assertFalse(runtime_config.public_status()["llm"]["configured"])

    def test_uploaded_image_is_owned_and_never_embedded_in_wrong_question_list(self) -> None:
        upload_id = self.upload_image()
        create = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={
                "subject": "数学",
                "question_text": "一个圆柱有几个圆形底面？",
                "source_upload_id": upload_id,
            },
        )
        self.assertEqual(create.status_code, 201)
        question_id = create.json()["question"]["id"]

        listing = self.client.get(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
        )
        image = self.client.get(
            f"/api/v1/wrong-questions/{question_id}/image",
            headers=self.student_headers,
        )
        outsider = self.client.get(
            f"/api/v1/wrong-questions/{question_id}/image",
            headers=self.second_student_headers,
        )

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["questions"]), 1)
        self.assertNotIn("source_image", listing.json()["questions"][0])
        self.assertNotIn("student-question-image", str(listing.json()))
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image.headers["content-type"], "image/png")
        self.assertEqual(image.content, b"\x89PNG\r\n\x1a\nstudent-question-image")
        self.assertEqual(outsider.status_code, 404)

    def test_one_staged_image_can_only_confirm_one_wrong_question(self) -> None:
        upload_id = self.upload_image()
        first = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "第一道题。", "source_upload_id": upload_id},
        )
        repeated = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "第二道题。", "source_upload_id": upload_id},
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(repeated.status_code, 409)
        self.assertEqual(
            len(self.client.get("/api/v1/wrong-questions", headers=self.student_headers).json()["questions"]),
            1,
        )

    def test_student_can_delete_only_own_unconfirmed_upload(self) -> None:
        upload_id = self.upload_image()
        deleted = self.client.delete(
            f"/api/v1/wrong-questions/uploads/{upload_id}",
            headers=self.student_headers,
        )
        missing_preview = self.client.get(
            f"/api/v1/wrong-questions/uploads/{upload_id}/image",
            headers=self.student_headers,
        )
        second_upload_id = self.upload_image()
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "确认后不能直接删除图片。", "source_upload_id": second_upload_id},
        )
        attached_delete = self.client.delete(
            f"/api/v1/wrong-questions/uploads/{second_upload_id}",
            headers=self.student_headers,
        )
        outsider_delete = self.client.delete(
            f"/api/v1/wrong-questions/uploads/{second_upload_id}",
            headers=self.second_student_headers,
        )

        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(missing_preview.status_code, 404)
        self.assertEqual(created.status_code, 201)
        self.assertEqual(attached_delete.status_code, 409)
        self.assertIsNone(attached_delete.headers.get("X-AI-Coach-Session-Context-Changed"))
        self.assertEqual(outsider_delete.status_code, 404)

    def test_listing_cleans_expired_staged_upload_but_retains_attached_image(self) -> None:
        staged_upload_id = self.upload_image()
        attached_upload_id = self.upload_image()
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={
                "subject": "数学",
                "question_text": "这张图片确认后应长期保留。",
                "source_upload_id": attached_upload_id,
            },
        )
        self.assertEqual(created.status_code, 201)
        question_id = created.json()["question"]["id"]

        # 两张图片都模拟为超过保留期限；清理逻辑只能删除 staged 状态的数据。
        connection = sqlite3.connect(self.repository.database_path)
        try:
            connection.execute(
                "UPDATE wrong_question_uploads SET expires_at = ? WHERE id IN (?, ?)",
                ("2000-01-01T00:00:00+00:00", staged_upload_id, attached_upload_id),
            )
            connection.commit()
        finally:
            connection.close()

        listing = self.client.get("/api/v1/wrong-questions", headers=self.student_headers)
        staged_preview = self.client.get(
            f"/api/v1/wrong-questions/uploads/{staged_upload_id}/image",
            headers=self.student_headers,
        )
        attached_image = self.client.get(
            f"/api/v1/wrong-questions/{question_id}/image",
            headers=self.student_headers,
        )

        self.assertEqual(listing.status_code, 200)
        self.assertEqual(staged_preview.status_code, 404)
        self.assertEqual(attached_image.status_code, 200)
        self.assertEqual(attached_image.content, b"\x89PNG\r\n\x1a\nstudent-question-image")

    def test_streamed_upload_without_content_length_stops_at_size_limit(self) -> None:
        class ChunkedRequest:
            headers: dict[str, str] = {}

            def __init__(self) -> None:
                self.yielded_chunks = 0

            async def stream(self):
                for chunk in (
                    b"a" * MAX_WRONG_QUESTION_IMAGE_BYTES,
                    b"b",
                    b"this-chunk-must-not-be-read",
                ):
                    self.yielded_chunks += 1
                    yield chunk

        request = ChunkedRequest()
        with self.assertRaises(PayloadTooLargeError):
            asyncio.run(read_limited_upload_body(request))

        self.assertEqual(request.yielded_chunks, 2)

    def test_question_text_must_be_confirmed_before_wrong_question_can_be_saved(self) -> None:
        upload_id = self.upload_image()

        response = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={
                "subject": "数学",
                "question_text": "   ",
                "source_upload_id": upload_id,
            },
        )
        listing = self.client.get(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.json()["questions"], [])

    def test_unconfigured_ocr_and_analysis_return_recoverable_manual_entry_guidance(self) -> None:
        upload_id = self.upload_image()
        ocr = self.client.post(
            "/api/v1/ocr/recognize",
            headers=self.student_headers,
            json={"upload_id": upload_id},
        )
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "求圆柱的侧面积。"},
        )
        question_id = created.json()["question"]["id"]
        analysis = self.client.post(
            f"/api/v1/wrong-questions/{question_id}/analyze",
            headers=self.student_headers,
        )

        self.assertEqual(ocr.status_code, 409)
        self.assertIn("手动", ocr.json()["detail"])
        self.assertEqual(analysis.status_code, 409)
        self.assertIn("教师", analysis.json()["detail"])

    def test_unconfigured_student_assistant_never_falls_back_to_fake_answer(self) -> None:
        response = self.client.post(
            "/api/v1/assistant",
            headers=self.student_headers,
            json={"question": "圆柱有几个底面？"},
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("教师", response.json()["detail"])

    def test_completed_ocr_and_analysis_are_reused_without_second_model_request(self) -> None:
        """重复提交同一资源时先命中本学生缓存，不能再消耗付费模型额度。"""

        class CountingOCRService:
            def __init__(self) -> None:
                self.calls = 0

            def recognize(self, **_) -> dict[str, object]:
                self.calls += 1
                return {
                    "question_text": "圆柱有几个圆形底面？",
                    "formulas": [],
                    "diagram_description": "一个圆柱。",
                    "model_name": "test-ocr",
                    "latency_ms": 1,
                }

        class CountingRuntimeService:
            def __init__(self) -> None:
                self.analysis_calls = 0

            def analyze_wrong_question(self, **_) -> dict[str, object]:
                self.analysis_calls += 1
                return {
                    "error_reason": "没有区分圆柱的底面和侧面。",
                    "knowledge_points": ["圆柱的特征"],
                    "suggestion": "先找出两个大小相同的圆形底面。",
                    "model_name": "test-llm",
                    "latency_ms": 1,
                }

        ocr_service = CountingOCRService()
        runtime_service = CountingRuntimeService()
        app.dependency_overrides[get_ocr_service] = lambda: ocr_service
        app.dependency_overrides[get_ai_runtime_service] = lambda: runtime_service
        one_request_per_capability = {
            "ocr": (60, 1),
            "wrong_question_analysis": (60, 1),
            "assistant": (60, 1),
            "math_variant": (60, 1),
        }

        with patch.object(StudentWorkspaceService, "_ai_rate_limits", one_request_per_capability):
            upload_id = self.upload_image()
            first_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.student_headers,
                json={"upload_id": upload_id},
            )
            repeated_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.student_headers,
                json={"upload_id": upload_id},
            )
            outsider_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.second_student_headers,
                json={"upload_id": upload_id},
            )

            created = self.client.post(
                "/api/v1/wrong-questions",
                headers=self.student_headers,
                json={"subject": "数学", "question_text": "圆柱有几个圆形底面？"},
            )
            question_id = created.json()["question"]["id"]
            first_analysis = self.client.post(
                f"/api/v1/wrong-questions/{question_id}/analyze",
                headers=self.student_headers,
            )
            repeated_analysis = self.client.post(
                f"/api/v1/wrong-questions/{question_id}/analyze",
                headers=self.student_headers,
            )
            outsider_analysis = self.client.post(
                f"/api/v1/wrong-questions/{question_id}/analyze",
                headers=self.second_student_headers,
            )

        self.assertEqual(first_ocr.status_code, 200)
        self.assertEqual(repeated_ocr.status_code, 200)
        self.assertEqual(first_ocr.json(), repeated_ocr.json())
        self.assertEqual(ocr_service.calls, 1)
        self.assertEqual(outsider_ocr.status_code, 404)
        self.assertEqual(first_analysis.status_code, 200)
        self.assertEqual(repeated_analysis.status_code, 200)
        self.assertEqual(outsider_analysis.status_code, 404)
        self.assertEqual(runtime_service.analysis_calls, 1)
        self.assertEqual(repeated_analysis.json()["analysis"]["model_name"], "缓存结果")
        self.assertEqual(repeated_analysis.json()["analysis"]["latency_ms"], 0)

    def test_ai_model_endpoints_are_rate_limited_per_student_and_capability(self) -> None:
        """四个会调用模型的学生接口都应在额度耗尽后返回可等待的 429。"""

        class FakeOCRService:
            def __init__(self) -> None:
                self.calls = 0

            def recognize(self, **_) -> dict[str, object]:
                self.calls += 1
                return {
                    "question_text": "圆柱有几个圆形底面？",
                    "formulas": [],
                    "diagram_description": None,
                    "model_name": "test-ocr",
                    "latency_ms": 1,
                }

        class FakeRuntimeService:
            def __init__(self) -> None:
                self.analysis_calls = 0
                self.assistant_calls = 0
                self.variant_calls = 0

            def analyze_wrong_question(self, **_) -> dict[str, object]:
                self.analysis_calls += 1
                return {
                    "error_reason": "没有区分底面和侧面。",
                    "knowledge_points": ["圆柱的特征"],
                    "suggestion": "先标记两个圆形底面。",
                    "model_name": "test-llm",
                    "latency_ms": 1,
                }

            def answer_assistant_question(self, _question: str) -> dict[str, object]:
                self.assistant_calls += 1
                return {"model_name": "test-llm", "reply": "请先观察两个底面。", "latency_ms": 1}

            def generate_math_variant(self, request):
                self.variant_calls += 1
                return MathQuestionGenerationResponse.model_validate(
                    {
                        "question": {
                            "id": f"ai-rate-limit-{self.variant_calls}",
                            "knowledge_point_id": request.knowledge_point_id,
                            "capability_tag": request.capability_tag,
                            "difficulty": request.difficulty,
                            "response_type": "single-choice",
                            "prompt": "圆柱有几个圆形底面？",
                            "options": [
                                {"id": "a", "text": "1个"},
                                {"id": "b", "text": "2个"},
                            ],
                            "correct_answer": "b",
                            "explanation": "圆柱有两个大小相同且平行的圆形底面。",
                            "visual": {"kind": "solid-model", "solid": "cylinder"},
                            "source": "ai-generated",
                        },
                        "model_name": "test-llm",
                        "latency_ms": 1,
                    }
                )

        ocr_service = FakeOCRService()
        runtime_service = FakeRuntimeService()
        app.dependency_overrides[get_ocr_service] = lambda: ocr_service
        app.dependency_overrides[get_ai_runtime_service] = lambda: runtime_service
        one_request_per_capability = {
            "ocr": (60, 1),
            "wrong_question_analysis": (60, 1),
            "assistant": (60, 1),
            "math_variant": (60, 1),
        }
        math_payload = {
            "knowledge_point_id": "g7u-shapes-solid",
            "capability_tag": "结构识别",
            "difficulty": "basic",
            "response_type": "single-choice",
        }

        with patch.object(StudentWorkspaceService, "_ai_rate_limits", one_request_per_capability):
            first_upload = self.upload_image()
            first_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.student_headers,
                json={"upload_id": first_upload},
            )
            second_upload = self.upload_image()
            limited_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.student_headers,
                json={"upload_id": second_upload},
            )

            first_question = self.client.post(
                "/api/v1/wrong-questions",
                headers=self.student_headers,
                json={"subject": "数学", "question_text": "圆柱有几个圆形底面？"},
            )
            second_question = self.client.post(
                "/api/v1/wrong-questions",
                headers=self.student_headers,
                json={"subject": "数学", "question_text": "圆柱的侧面是什么形状？"},
            )
            first_analysis = self.client.post(
                f"/api/v1/wrong-questions/{first_question.json()['question']['id']}/analyze",
                headers=self.student_headers,
            )
            limited_analysis = self.client.post(
                f"/api/v1/wrong-questions/{second_question.json()['question']['id']}/analyze",
                headers=self.student_headers,
            )

            first_assistant = self.client.post(
                "/api/v1/assistant",
                headers=self.student_headers,
                json={"question": "圆柱有几个底面？"},
            )
            limited_assistant = self.client.post(
                "/api/v1/assistant",
                headers=self.student_headers,
                json={"question": "圆柱的侧面是什么？"},
            )

            first_variant = self.client.post(
                "/api/v1/me/math-variant-questions",
                headers=self.student_headers,
                json=math_payload,
            )
            limited_variant = self.client.post(
                "/api/v1/me/math-variant-questions",
                headers=self.student_headers,
                json=math_payload,
            )

            second_student_upload = self.upload_image(headers=self.second_student_headers)
            second_student_ocr = self.client.post(
                "/api/v1/ocr/recognize",
                headers=self.second_student_headers,
                json={"upload_id": second_student_upload},
            )

        self.assertEqual(first_ocr.status_code, 200)
        self.assertEqual(first_analysis.status_code, 200)
        self.assertEqual(first_assistant.status_code, 200)
        self.assertEqual(first_variant.status_code, 200)
        self.assertEqual(second_student_ocr.status_code, 200)
        for response in (limited_ocr, limited_analysis, limited_assistant, limited_variant):
            self.assertEqual(response.status_code, 429)
            self.assertGreaterEqual(int(response.headers["retry-after"]), 1)
            self.assertNotIn("key", response.json()["detail"].lower())
        self.assertEqual(ocr_service.calls, 2)
        self.assertEqual(runtime_service.analysis_calls, 1)
        self.assertEqual(runtime_service.assistant_calls, 1)
        self.assertEqual(runtime_service.variant_calls, 1)

    def test_ai_rate_limiter_isolated_by_student_and_capability(self) -> None:
        """服务层限流键应同时包含学生身份和能力名称。"""

        first_student = self.workspace_service.get_current_user(
            self.student_headers["Authorization"].removeprefix("Bearer ")
        )
        second_student = self.workspace_service.get_current_user(
            self.second_student_headers["Authorization"].removeprefix("Bearer ")
        )
        one_request_per_capability = {
            "ocr": (60, 1),
            "wrong_question_analysis": (60, 1),
            "assistant": (60, 1),
            "math_variant": (60, 1),
        }

        with patch.object(StudentWorkspaceService, "_ai_rate_limits", one_request_per_capability):
            for capability in one_request_per_capability:
                self.workspace_service.require_ai_request_allowed(
                    user=first_student,
                    capability=capability,
                )
                with self.assertRaises(AIRequestRateLimitError) as limited:
                    self.workspace_service.require_ai_request_allowed(
                        user=first_student,
                        capability=capability,
                    )
                self.assertGreaterEqual(limited.exception.retry_after_seconds, 1)
                self.workspace_service.require_ai_request_allowed(
                    user=second_student,
                    capability=capability,
                )

    def test_ai_rate_limit_contract_is_exposed_in_openapi(self) -> None:
        specification = self.client.get("/openapi.json").json()
        protected_paths = (
            "/api/v1/ocr/recognize",
            "/api/v1/wrong-questions/{question_id}/analyze",
            "/api/v1/assistant",
            "/api/v1/me/math-variant-questions",
        )

        for path in protected_paths:
            response_contract = specification["paths"][path]["post"]["responses"]["429"]
            self.assertIn("Retry-After", response_contract["description"])

    def test_unsupported_or_oversized_images_are_rejected_before_storage(self) -> None:
        unsupported = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={**self.student_headers, "Content-Type": "image/gif"},
            content=b"GIF89a",
        )
        oversized = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={
                **self.student_headers,
                "Content-Type": "image/jpeg",
                "Content-Length": str(5 * 1024 * 1024 + 1),
            },
            content=b"small-body",
        )

        self.assertEqual(unsupported.status_code, 415)
        self.assertEqual(oversized.status_code, 413)

    def test_image_media_type_must_match_real_file_signature(self) -> None:
        forged = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={**self.student_headers, "Content-Type": "image/png"},
            content=b"this-is-not-a-real-png",
        )

        self.assertEqual(forged.status_code, 400)
        self.assertIn("图片", forged.json()["detail"])

    def test_student_can_edit_and_delete_only_own_confirmed_wrong_question(self) -> None:
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={
                "subject": "数学",
                "question_text": "解方程 2x + 1 = 7。",
                "knowledge_points": ["一元一次方程"],
                "error_reason": "移项时漏掉了常数项。",
            },
        )
        question_id = created.json()["question"]["id"]
        updated = self.client.patch(
            f"/api/v1/wrong-questions/{question_id}",
            headers=self.student_headers,
            json={"question_text": "解方程 2x + 1 = 7，并检验。", "error_reason": None},
        )
        outsider = self.client.patch(
            f"/api/v1/wrong-questions/{question_id}",
            headers=self.second_student_headers,
            json={"subject": "英语"},
        )
        deleted = self.client.delete(
            f"/api/v1/wrong-questions/{question_id}",
            headers=self.student_headers,
        )

        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["question"]["error_reason"], None)
        self.assertEqual(outsider.status_code, 404)
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(
            self.client.get("/api/v1/wrong-questions", headers=self.student_headers).json()["questions"],
            [],
        )

    def test_wrong_question_list_has_bounded_pagination(self) -> None:
        for number in (1, 2):
            response = self.client.post(
                "/api/v1/wrong-questions",
                headers=self.student_headers,
                json={"subject": "数学", "question_text": f"第 {number} 道错题。"},
            )
            self.assertEqual(response.status_code, 201)

        page = self.client.get(
            "/api/v1/wrong-questions?limit=1&offset=1",
            headers=self.student_headers,
        )

        self.assertEqual(page.status_code, 200)
        self.assertEqual(len(page.json()["questions"]), 1)
        self.assertEqual(page.json()["total"], 2)
        self.assertEqual(page.json()["limit"], 1)
        self.assertEqual(page.json()["offset"], 1)

    def test_configured_ocr_returns_only_candidate_until_student_confirms_it(self) -> None:
        runtime_config = AIRuntimeConfig(
            Settings(
                ocr_enabled=True,
                ocr_provider="openai_compatible_vision",
                ocr_api_base_url="https://vision.example.test/v1",
                ocr_api_key="test-ocr-secret-key",
                ocr_model="vision-test-model",
            )
        )

        class FakeResponse:
            def read(self) -> bytes:
                return json.dumps(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": json.dumps(
                                        {
                                            "question_text": "圆柱有几个圆形底面？",
                                            "formulas": ["S侧 = 2πrh"],
                                            "diagram_description": "一个上下底面相同的圆柱。",
                                        },
                                        ensure_ascii=False,
                                    )
                                }
                            }
                        ]
                    },
                    ensure_ascii=False,
                ).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return None

        def sender(request, *, timeout):
            self.assertEqual(timeout, 20)
            request_payload = json.loads(request.data.decode("utf-8"))
            self.assertEqual(request_payload["model"], "vision-test-model")
            self.assertIn("image_url", str(request_payload["messages"][-1]["content"]))
            return FakeResponse()

        app.dependency_overrides[get_ocr_service] = lambda: OCRService(
            runtime_config,
            ModelConnectionTestService(http_sender=sender),
        )
        upload_id = self.upload_image()
        recognition = self.client.post(
            "/api/v1/ocr/recognize",
            headers=self.student_headers,
            json={"upload_id": upload_id},
        )
        before_confirmation = self.client.get(
            "/api/v1/wrong-questions", headers=self.student_headers
        )

        self.assertEqual(recognition.status_code, 200)
        self.assertEqual(recognition.json()["question_text"], "圆柱有几个圆形底面？")
        self.assertEqual(recognition.json()["formulas"], ["S侧 = 2πrh"])
        self.assertEqual(before_confirmation.json()["questions"], [])
        self.assertNotIn("test-ocr-secret-key", str(recognition.json()))

    def test_invalid_ocr_reply_is_rejected_instead_of_creating_fake_recognition(self) -> None:
        runtime_config = AIRuntimeConfig(
            Settings(
                ocr_enabled=True,
                ocr_provider="openai_compatible_vision",
                ocr_api_base_url="https://vision.example.test/v1",
                ocr_api_key="test-ocr-secret-key",
                ocr_model="vision-test-model",
            )
        )

        class FakeResponse:
            def read(self) -> bytes:
                return json.dumps(
                    {"choices": [{"message": {"content": "不是 JSON"}}]},
                    ensure_ascii=False,
                ).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return None

        app.dependency_overrides[get_ocr_service] = lambda: OCRService(
            runtime_config,
            ModelConnectionTestService(http_sender=lambda request, timeout: FakeResponse()),
        )
        upload_id = self.upload_image()
        recognition = self.client.post(
            "/api/v1/ocr/recognize",
            headers=self.student_headers,
            json={"upload_id": upload_id},
        )

        self.assertEqual(recognition.status_code, 422)
        self.assertIn("手动", recognition.json()["detail"])
        self.assertEqual(
            self.client.get("/api/v1/wrong-questions", headers=self.student_headers).json()["questions"],
            [],
        )

    def test_configured_analysis_persists_validated_result_without_exposing_key(self) -> None:
        runtime_config = AIRuntimeConfig(
            Settings(
                llm_enabled=True,
                llm_provider="OpenAI",
                llm_api_base_url="https://model.example.test/v1",
                llm_api_key="test-llm-secret-key",
                llm_model="coach-test-model",
            )
        )

        class FakeResponse:
            def read(self) -> bytes:
                return json.dumps(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": json.dumps(
                                        {
                                            "error_reason": "把圆柱侧面积公式误当成底面积公式。",
                                            "knowledge_points": ["圆柱的表面积"],
                                            "suggestion": "先画展开图，再区分侧面和两个底面。",
                                        },
                                        ensure_ascii=False,
                                    )
                                }
                            }
                        ]
                    },
                    ensure_ascii=False,
                ).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_value, traceback):
                return None

        app.dependency_overrides[get_ai_runtime_service] = lambda: AIRuntimeService(
            runtime_config,
            ModelConnectionTestService(http_sender=lambda request, timeout: FakeResponse()),
        )
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "求圆柱的表面积。"},
        )
        question_id = created.json()["question"]["id"]
        analysis = self.client.post(
            f"/api/v1/wrong-questions/{question_id}/analyze",
            headers=self.student_headers,
        )
        status_response = self.client.get("/api/v1/me/integrations", headers=self.student_headers)

        self.assertEqual(analysis.status_code, 200)
        self.assertEqual(analysis.json()["question"]["analysis_status"], "completed")
        self.assertEqual(analysis.json()["analysis"]["knowledge_points"], ["圆柱的表面积"])
        self.assertNotIn("test-llm-secret-key", str(analysis.json()))
        self.assertEqual(status_response.json()["llm"]["configured"], True)
        self.assertNotIn("test-llm-secret-key", str(status_response.json()))

    def test_editing_question_content_invalidates_stale_ai_analysis(self) -> None:
        class FakeRuntimeService:
            def analyze_wrong_question(self, **_):
                return {
                    "error_reason": "误把底面半径当成直径。",
                    "knowledge_points": ["圆柱的表面积"],
                    "suggestion": "先标注半径和直径。",
                    "model_name": "test",
                    "latency_ms": 1,
                }

        app.dependency_overrides[get_ai_runtime_service] = lambda: FakeRuntimeService()
        created = self.client.post(
            "/api/v1/wrong-questions",
            headers=self.student_headers,
            json={"subject": "数学", "question_text": "已知圆柱半径，求表面积。"},
        )
        question_id = created.json()["question"]["id"]
        analyzed = self.client.post(
            f"/api/v1/wrong-questions/{question_id}/analyze",
            headers=self.student_headers,
        )
        updated = self.client.patch(
            f"/api/v1/wrong-questions/{question_id}",
            headers=self.student_headers,
            json={"question_text": "已知圆柱直径和高，求表面积。"},
        )

        self.assertEqual(analyzed.status_code, 200)
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["question"]["analysis_status"], "not_requested")
        self.assertIsNone(updated.json()["question"]["analysis_summary"])
        self.assertIsNone(updated.json()["question"]["error_reason"])

    def test_student_variant_endpoint_registers_answer_without_returning_it_to_browser(self) -> None:
        class FakeRuntimeService:
            def integration_status(self):
                return {
                    "llm": {"enabled": True, "configured": True, "provider": "OpenAI", "model": "test"},
                    "ocr": {"enabled": False, "configured": False, "provider": None, "model": None},
                }

            def generate_math_variant(self, request):
                return MathQuestionGenerationResponse.model_validate(
                    {
                        "question": {
                            "id": "ai-solid-registered-api",
                            "knowledge_point_id": request.knowledge_point_id,
                            "capability_tag": request.capability_tag,
                            "difficulty": request.difficulty,
                            "response_type": "single-choice",
                            "prompt": "圆柱有几个圆形底面？",
                            "options": [{"id": "a", "text": "1个"}, {"id": "b", "text": "2个"}],
                            "correct_answer": "b",
                            "explanation": "圆柱有两个大小相同且平行的圆形底面。",
                            "visual": {"kind": "solid-model", "solid": "cylinder"},
                            "source": "ai-generated",
                        },
                        "model_name": "test",
                        "latency_ms": 1,
                    }
                )

        app.dependency_overrides[get_ai_runtime_service] = lambda: FakeRuntimeService()
        generated = self.client.post(
            "/api/v1/me/math-variant-questions",
            headers=self.student_headers,
            json={
                "knowledge_point_id": "g7u-shapes-solid",
                "capability_tag": "结构识别",
                "difficulty": "basic",
                "response_type": "single-choice",
            },
        )
        math_task = self.client.get("/api/v1/me/tasks/today", headers=self.student_headers).json()["tasks"][0]
        self.assertEqual(
            self.client.post(
                f"/api/v1/me/tasks/{math_task['id']}/start", headers=self.student_headers
            ).status_code,
            200,
        )
        completion = self.client.post(
            f"/api/v1/me/tasks/{math_task['id']}/complete",
            headers=self.student_headers,
            json={
                "reflection": "我完成了图形结构诊断，并能区分圆柱的底面和侧面。",
                "evidence": {
                    "kind": "math_diagnosis",
                    "attempts": [
                        {"question_id": "solid-01", "answer": "a"},
                        {"question_id": "solid-02", "answer": "b"},
                        {"question_id": "solid-03", "answer": "true"},
                        {"question_id": "solid-04", "answer": ["a", "b", "d"]},
                        {"question_id": "solid-05", "answer": "c"},
                        {"question_id": "solid-06", "answer": "true"},
                        {"question_id": "solid-07", "answer": ["a", "b"]},
                        {"question_id": "solid-08", "answer": "a"},
                        {"question_id": "solid-09", "answer": {"challengeId": "solid-cube-parts", "passed": True}},
                        {"question_id": "ai-solid-registered-api", "answer": "b"},
                    ],
                },
            },
        )

        self.assertEqual(generated.status_code, 200)
        self.assertEqual(generated.json()["question"]["id"], "ai-solid-registered-api")
        self.assertNotIn("correct_answer", generated.json()["question"])
        self.assertNotIn("explanation", generated.json()["question"])
        self.assertEqual(completion.status_code, 200)

    def test_interactive_variant_uses_server_schema_but_accepts_student_challenge_evidence(self) -> None:
        class FakeRuntimeService:
            def generate_math_variant(self, request):
                return MathQuestionGenerationResponse.model_validate(
                    {
                        "question": {
                            "id": "ai-solid-interactive-api",
                            "knowledge_point_id": request.knowledge_point_id,
                            "capability_tag": request.capability_tag,
                            "difficulty": request.difficulty,
                            "response_type": "interactive",
                            "prompt": "拖动模型，找出圆柱的两个底面。",
                            "options": None,
                            "correct_answer": {"challenge_id": "solid-cylinder-surfaces", "passed": True},
                            "explanation": "圆柱有两个相同且平行的圆形底面。",
                            "visual": {"kind": "solid-model", "solid": "cylinder"},
                            "source": "ai-generated",
                        },
                        "model_name": "test",
                        "latency_ms": 1,
                    }
                )

        app.dependency_overrides[get_ai_runtime_service] = lambda: FakeRuntimeService()
        generated = self.client.post(
            "/api/v1/me/math-variant-questions",
            headers=self.student_headers,
            json={
                "knowledge_point_id": "g7u-shapes-solid",
                "capability_tag": "结构识别",
                "difficulty": "basic",
                "response_type": "interactive",
            },
        )
        math_task = self.client.get("/api/v1/me/tasks/today", headers=self.student_headers).json()["tasks"][0]
        self.client.post(f"/api/v1/me/tasks/{math_task['id']}/start", headers=self.student_headers)
        completion = self.client.post(
            f"/api/v1/me/tasks/{math_task['id']}/complete",
            headers=self.student_headers,
            json={
                "reflection": "我完成了图形结构诊断，并能识别圆柱的两个底面。",
                "evidence": {
                    "kind": "math_diagnosis",
                    "attempts": [
                        {"question_id": "solid-01", "answer": "a"},
                        {"question_id": "solid-02", "answer": "b"},
                        {"question_id": "solid-03", "answer": "true"},
                        {"question_id": "solid-04", "answer": ["a", "b", "d"]},
                        {"question_id": "solid-05", "answer": "c"},
                        {"question_id": "solid-06", "answer": "true"},
                        {"question_id": "solid-07", "answer": ["a", "b"]},
                        {"question_id": "solid-08", "answer": "a"},
                        {"question_id": "solid-09", "answer": {"challengeId": "solid-cube-parts", "passed": True}},
                        {
                            "question_id": "ai-solid-interactive-api",
                            "answer": {"challengeId": "solid-cylinder-surfaces", "passed": True},
                        },
                    ],
                },
            },
        )

        self.assertEqual(generated.status_code, 200)
        self.assertEqual(completion.status_code, 200)


if __name__ == "__main__":
    unittest.main()
