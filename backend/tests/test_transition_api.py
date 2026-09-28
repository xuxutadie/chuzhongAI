"""诊断闭环集成测试，使用临时数据库，不写真实学生数据。"""
import tempfile
import json
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.api.routes.student_workspace import get_student_workspace_service
from app.api.routes.ai_learning import get_ai_runtime_service
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService
from app.services.ai_runtime_config import AIRuntimeService, AIRuntimeConfig
from app.core.config import Settings


class TransitionApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = StudentWorkspaceService(StudentWorkspaceRepository(Path(self.temp.name) / "test.db"))
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        app.dependency_overrides[get_ai_runtime_service] = lambda: AIRuntimeService(AIRuntimeConfig(Settings(llm_enabled=False)))
        StudentWorkspaceService._clear_registration_attempts_for_testing()
        StudentWorkspaceService._clear_ai_request_limits_for_testing()
        self.client = TestClient(app)
        result = self.client.post("/api/v1/auth/register", json={"username": "test-learner", "password": "safe-test-password", "display_name": "测试同学", "grade": "六年级"})
        self.assertEqual(result.status_code, 201, result.text)
        self.headers = {"Authorization": f'Bearer {result.json()["access_token"]}'}
        self.base = "/api/v1/me/diagnosis"

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.temp.cleanup()

    def test_auth_validation_fallback_and_pdf(self):
        self.assertEqual(self.client.get(self.base).status_code, 401)
        conflict = self.client.get(self.base, headers={**self.headers, "X-AI-Coach-Expected-User-Id": "9999"})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.headers["X-AI-Coach-Session-Context-Changed"], "1")
        invalid = self.client.put(self.base + "/profile", headers=self.headers, json={"revision": 0, "fields": {"exam_score": 110, "exam_total": 100}})
        self.assertEqual(invalid.status_code, 422)
        question = self.client.post(self.base + "/question", headers=self.headers, json={"field": "grade"})
        self.assertEqual(question.status_code, 200)
        self.assertEqual(question.json()["mode"], "rules")
        self.client.put(self.base + "/profile", headers=self.headers, json={"revision": 0, "confirmed": True, "fields": {"nickname": "测试同学", "grade": "六年级", "textbook": "人教版", "school_name": "学校", "class_name": "一班"}})
        attempt = self.client.post(self.base + "/attempts", headers=self.headers, json={}).json()
        self.assertEqual(len(attempt["paper"]), 24)
        self.assertNotIn("answer", attempt["paper"][0])
        base = self.base + "/attempts/" + attempt["id"]
        self.assertEqual(self.client.get(base + "/pdf", headers=self.headers).status_code, 409)
        self.assertEqual(self.client.put(base + "/answers", headers=self.headers, json={"revision": 0, "answers": {"fake": "A"}}).status_code, 422)
        result = self.client.post(base + "/submit", headers=self.headers, json={"revision": 0})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertEqual(result.json()["report"]["distribution"]["skipped"], 24)
        pdf = self.client.get(base + "/pdf", headers=self.headers)
        self.assertEqual(pdf.status_code, 200, pdf.text[:100] if pdf.status_code != 200 else "")
        self.assertTrue(pdf.content.startswith(b"%PDF"))
        self.assertIn("private", pdf.headers["cache-control"])
        self.assertIn("attachment", pdf.headers["content-disposition"])
        self.assertEqual(self.client.post(base + "/interpret", headers=self.headers, json={}).json()["report"]["interpretation_mode"], "rules")

    def test_setup_status_and_retest_preserves_history(self):
        self.assertEqual(self.client.get("/api/v1/auth/setup-status").json(), {"setup_required": True})
        self.client.put(self.base + "/profile", headers=self.headers, json={"revision": 0, "confirmed": True, "fields": {"nickname": "测试", "grade": "七年级", "textbook": "不确定", "school_name": "学校", "class_name": "一班"}})
        first = self.client.post(self.base + "/attempts", headers=self.headers, json={}).json()
        self.client.post(self.base + "/attempts/" + first["id"] + "/submit", headers=self.headers, json={"revision": 0})
        second = self.client.post(self.base + "/attempts", headers=self.headers, json={"retest": True}).json()
        self.assertNotEqual(first["id"], second["id"])
        state = self.client.get(self.base, headers=self.headers).json()
        self.assertEqual(len(state["history"]), 2)
        self.assertEqual(state["history"][1]["status"], "submitted")

    def test_interview_details_roundtrip_and_unknown_question_rejected(self):
        details = {"progress": "圆柱与圆锥", "geometry_detail": "不会找底和高"}
        saved = self.client.put(self.base + "/profile", headers=self.headers, json={"revision": 0,
            "fields": {"learning_details": details, "answered_fields": ["progress", "geometry_detail"]}})
        self.assertEqual(saved.status_code, 200, saved.text)
        restored = self.client.get(self.base, headers=self.headers).json()
        self.assertEqual(restored["profile"]["fields"]["learning_details"], details)
        response = self.client.post(self.base + "/question", headers=self.headers, json={"field": "geometry_detail"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("空间想象", response.json()["message"])
        self.assertEqual(self.client.post(self.base + "/question", headers=self.headers, json={"field": "fake"}).status_code, 422)

    def test_new_daily_tasks_only_create_math(self):
        selected = self.client.put("/api/v1/me/course-context", headers=self.headers, json={
            "course_id": "nnu-math-g7-upper", "chapter_id": "g7u-chapter-1", "knowledge_point_ids": ["g7u-shapes-solid"],
        })
        self.assertEqual(selected.status_code, 200, selected.text)
        tasks = self.client.get("/api/v1/me/tasks/today", headers=self.headers).json()["tasks"]
        self.assertEqual([row["subject"] for row in tasks], ["数学"])

    def test_configured_ai_only_adds_text_and_cannot_change_score(self):
        captured = []

        class FakeCompletion:
            def request_json_completion(self, session, messages, max_tokens):
                captured.append(messages)
                return json.dumps({"opening": "我们一步一步来了解你的学习情况。", "guidance": "先从画图和写出关键步骤开始，逐题回顾，再做少量变式练习。"}, ensure_ascii=False), 1

        config = AIRuntimeConfig(Settings(_env_file=None, llm_enabled=True, llm_provider="test", llm_model="fake",
                                         llm_api_base_url="https://example.com/v1", llm_api_key="fake-test-key"))
        app.dependency_overrides[get_ai_runtime_service] = lambda: AIRuntimeService(config, FakeCompletion())
        self.client.put(self.base + "/profile", headers=self.headers, json={"revision": 0, "confirmed": True, "fields": {"nickname": "不会发送给AI的昵称", "grade": "七年级", "textbook": "不确定", "school_name": "学校", "class_name": "一班"}})
        question = self.client.post(self.base + "/question", headers=self.headers, json={"field": "goal"}).json()
        self.assertEqual(question["mode"], "ai")
        self.assertNotIn("不会发送给AI的昵称", str(captured))
        attempt = self.client.post(self.base + "/attempts", headers=self.headers, json={}).json()
        base = self.base + "/attempts/" + attempt["id"]
        initial = self.client.post(base + "/submit", headers=self.headers, json={"revision": 0}).json()
        interpreted = self.client.post(base + "/interpret", headers=self.headers, json={}).json()
        self.assertEqual(interpreted["report"]["interpretation_mode"], "ai")
        self.assertEqual(interpreted["report"]["score"], initial["report"]["score"])
        self.assertEqual(interpreted["report"]["evidence"], initial["report"]["evidence"])
