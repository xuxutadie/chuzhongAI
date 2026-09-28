"""个人/教师 AI 路由隔离：仅临时数据库和假模型响应，不调用外部 API。"""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes.student_workspace import get_student_workspace_service
from app.core.config import settings
from app.main import app
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.model_connection_test_service import ModelConnectionTestService
from app.services.student_workspace_service import StudentWorkspaceService
from tests.test_math_question_generation_service import valid_question


class PersonalAIRouteTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.repository = StudentWorkspaceRepository(Path(self.directory.name) / "accounts.db")
        self.service = StudentWorkspaceService(self.repository)
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        self.client = TestClient(app)
        StudentWorkspaceService._clear_ai_request_limits_for_testing()
        self.admin = self.service.bootstrap_admin(
            username="test-teacher", password="testing-password", display_name="测试教师"
        )
        self.managed = self.service.create_student(
            teacher=self.admin["user"], username="managed-student", password="testing-password",
            display_name="班级学生", grade="初一",
        )
        self.personal_headers = self.create_personal("personal-student")
        self.other_headers = self.create_personal("other-student")
        self.managed_headers = self.authorization(self.service.login(
            username="managed-student", password="testing-password"
        ))
        self.teacher_headers = self.authorization(self.admin)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.client.close()
        self.directory.cleanup()

    @staticmethod
    def authorization(auth):
        return {"Authorization": "Bearer " + auth["access_token"]}

    def create_personal(self, username):
        self.repository.create_user(
            username=username, password_hash=self.service._hash_password("testing-password"),
            display_name="自主学生", role="student", created_by=None,
        )
        return self.authorization(self.service.login(username=username, password="testing-password"))

    @staticmethod
    def config(**updates):
        return {
            "enabled": True, "provider": "OpenAI", "api_base_url": "https://api.openai.com/v1",
            "model": "test-model", "api_key": "test-personal-key-not-real", **updates,
        }

    def save(self, capability="llm", **updates):
        return self.client.put(
            "/api/v1/me/ai-config/" + capability,
            headers=self.personal_headers, json=self.config(**updates),
        )

    def prepare_four_ai_requests(self):
        """通过真实选课、上传和手动录题接口准备资源，不绕过身份解析。"""

        selected = self.client.put(
            "/api/v1/me/course-context", headers=self.personal_headers,
            json={"course_id": "nnu-math-g7-upper", "chapter_id": "g7u-chapter-1",
                  "knowledge_point_ids": ["g7u-shapes-solid"]},
        )
        self.assertEqual(selected.status_code, 200, selected.text)
        upload = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={**self.personal_headers, "Content-Type": "image/png"},
            content=b"\x89PNG\r\n\x1a\ntest-image",
        )
        self.assertEqual(upload.status_code, 201, upload.text)
        question = self.client.post(
            "/api/v1/wrong-questions", headers=self.personal_headers,
            json={"subject": "数学", "question_text": "正方体共有多少条棱？",
                  "knowledge_points": ["立体图形结构"]},
        )
        self.assertEqual(question.status_code, 201, question.text)
        generated = valid_question()
        return [
            ("assistant", "/api/v1/assistant", {"question": "什么是圆柱？"}),
            ("ocr", "/api/v1/ocr/recognize", {"upload_id": upload.json()["upload_id"]}),
            ("analysis", f"/api/v1/wrong-questions/{question.json()['question']['id']}/analyze", None),
            ("variant", "/api/v1/me/math-variant-questions", {
                field: generated[field]
                for field in ("knowledge_point_id", "capability_tag", "difficulty", "response_type")
            }),
        ]

    def test_personal_config_is_authenticated_and_never_uses_managed_credentials(self):
        self.assertEqual(self.client.get("/api/v1/me/ai-config").status_code, 401)
        with patch.multiple(settings, llm_enabled=True, llm_provider="OpenAI",
                            llm_api_base_url="https://api.openai.com/v1",
                            llm_api_key="test-managed-key-not-real", llm_model="managed-model"):
            personal = self.client.get("/api/v1/me/integrations", headers=self.personal_headers)
            managed = self.client.get("/api/v1/me/integrations", headers=self.managed_headers)
            teacher = self.client.get("/api/v1/teacher/ai-config/status", headers=self.teacher_headers)
            self.assertEqual(personal.status_code, 200)
            self.assertFalse(personal.json()["llm"]["configured"])
            self.assertTrue(managed.json()["llm"]["configured"])
            self.assertTrue(teacher.json()["llm"]["configured"])
            failed = self.client.post("/api/v1/assistant", headers=self.personal_headers,
                                      json={"question": "什么是圆柱？"})
            self.assertEqual(failed.status_code, 409)
            self.assertIn("AI 设置", failed.json()["detail"])
            self.assertNotIn("test-managed-key-not-real", failed.text)

    def test_managed_students_cannot_save_or_clear_personal_configuration(self):
        state = self.client.get("/api/v1/me/ai-config", headers=self.managed_headers)
        self.assertEqual(state.status_code, 200)
        self.assertEqual(state.json()["mode"], "managed")
        for headers in (self.managed_headers, self.teacher_headers):
            denied = self.client.put("/api/v1/me/ai-config/llm", headers=headers, json=self.config())
            self.assertEqual(denied.status_code, 403)
            denied = self.client.delete("/api/v1/me/ai-config/llm", headers=headers)
            self.assertEqual(denied.status_code, 403)

    def test_saved_configuration_is_own_only_and_clear_disables_runtime(self):
        saved = self.save()
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertTrue(saved.json()["llm"]["has_api_key"])
        self.assertNotIn("test-personal-key-not-real", saved.text)
        mine = self.client.get("/api/v1/me/integrations", headers=self.personal_headers)
        other = self.client.get("/api/v1/me/integrations", headers=self.other_headers)
        self.assertTrue(mine.json()["llm"]["configured"])
        self.assertFalse(other.json()["llm"]["configured"])
        cleared = self.client.delete("/api/v1/me/ai-config/llm", headers=self.personal_headers)
        self.assertEqual(cleared.status_code, 200)
        self.assertFalse(cleared.json()["llm"]["configured"])

    def test_all_four_ai_routes_send_only_the_students_own_credentials(self):
        self.assertEqual(self.save().status_code, 200)
        self.assertEqual(self.save("ocr", api_key="test-ocr-key-not-real").status_code, 200)
        requests = self.prepare_four_ai_requests()
        captured = []

        def fake_completion(_service, *, api_key, messages, **_kwargs):
            user_content = messages[-1]["content"]
            if isinstance(user_content, list):
                captured.append(("ocr", api_key))
                return json.dumps({"question_text": "圆柱有几个底面？", "formulas": [],
                                   "diagram_description": "圆柱"}), 1
            try:
                structured_request = json.loads(user_content)
            except json.JSONDecodeError:
                captured.append(("assistant", api_key))
                return "先观察它的两个底面。", 1
            if "question_text" in structured_request:
                captured.append(("analysis", api_key))
                return json.dumps({"error_reason": "混淆了棱和顶点的数量。",
                                   "knowledge_points": ["立体图形结构"],
                                   "suggestion": "分别标记顶点，再沿每条棱逐一计数。"}), 1
            if "knowledge_point_id" in structured_request:
                captured.append(("variant", api_key))
                return json.dumps(valid_question()), 1
            raise AssertionError("出现了没有准备测试响应的 AI 请求")

        with patch.multiple(
            settings, llm_enabled=True, llm_provider="OpenAI",
            llm_api_base_url="https://api.openai.com/v1", llm_api_key="test-managed-key-not-real",
            llm_model="managed-model", ocr_enabled=True, ocr_provider="openai_compatible_vision",
            ocr_api_base_url="https://api.openai.com/v1", ocr_api_key="test-managed-ocr-not-real",
            ocr_model="managed-vision",
        ), patch.object(ModelConnectionTestService, "_request_completion", fake_completion):
            for capability, path, payload in requests:
                with self.subTest(capability=capability):
                    response = self.client.post(path, headers=self.personal_headers, json=payload)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertNotIn("test-personal-key-not-real", response.text)
                    self.assertNotIn("test-ocr-key-not-real", response.text)
                    if capability == "variant":
                        self.assertNotIn("correct_answer", response.json()["question"])
                        self.assertNotIn("explanation", response.json()["question"])
        self.assertEqual(captured, [
            ("assistant", "test-personal-key-not-real"),
            ("ocr", "test-ocr-key-not-real"),
            ("analysis", "test-personal-key-not-real"),
            ("variant", "test-personal-key-not-real"),
        ])

    def test_all_four_ai_routes_without_personal_config_reject_shared_fallback_before_any_call(self):
        requests = self.prepare_four_ai_requests()
        with patch.multiple(
            settings, llm_enabled=True, llm_provider="OpenAI",
            llm_api_base_url="https://api.openai.com/v1", llm_api_key="test-managed-key-not-real",
            llm_model="managed-model", ocr_enabled=True, ocr_provider="openai_compatible_vision",
            ocr_api_base_url="https://api.openai.com/v1", ocr_api_key="test-managed-ocr-not-real",
            ocr_model="managed-vision",
        ), patch.object(
            ModelConnectionTestService, "_request_completion",
            side_effect=AssertionError("未配置个人 API 时不应向任何模型发出请求"),
        ) as external_call:
            managed = self.client.get("/api/v1/me/integrations", headers=self.managed_headers)
            self.assertTrue(managed.json()["llm"]["configured"])
            self.assertTrue(managed.json()["ocr"]["configured"])
            for capability, path, payload in requests:
                with self.subTest(capability=capability):
                    response = self.client.post(path, headers=self.personal_headers, json=payload)
                    self.assertEqual(response.status_code, 409, response.text)
                    self.assertIn("AI 设置", response.json()["detail"])
                    self.assertNotIn("test-managed-key-not-real", response.text)
                    self.assertNotIn("test-managed-ocr-not-real", response.text)
            external_call.assert_not_called()

    def test_invalid_sensitive_inputs_are_not_echoed_back(self):
        secret_marker = "sensitive-input-should-not-be-echoed"
        response = self.save(api_key={"invalid": secret_marker})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(secret_marker, response.text)
        response = self.save(api_base_url="https://127.0.0.1/v1")
        self.assertIn(response.status_code, (400, 422))
        self.assertNotIn("test-personal-key-not-real", response.text)
