"""学生自主课程选择与当天任务课程快照的接口回归测试。"""

from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.routes.ai_learning import get_ai_runtime_service
from app.api.routes.student_workspace import get_student_workspace_service
from app.main import app
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.schemas.math_question_generation import MathQuestionGenerationResponse
from app.services.student_workspace_service import StudentWorkspaceService


class CourseContextApiTests(unittest.TestCase):
    def setUp(self) -> None:
        StudentWorkspaceService._clear_ai_request_limits_for_testing()
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.repository = StudentWorkspaceRepository(
            Path(self.temporary_directory.name) / "student-workspace.db"
        )
        self.service = StudentWorkspaceService(self.repository, session_ttl_hours=12)
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
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
        return response.json()["access_token"]

    @staticmethod
    def selected_context_payload(*knowledge_point_ids: str) -> dict[str, object]:
        return {
            "course_id": "nnu-math-g7-upper",
            "chapter_id": "g7u-chapter-1",
            "knowledge_point_ids": list(knowledge_point_ids),
        }

    @staticmethod
    def solid_attempts() -> list[dict[str, object]]:
        return [
            {"question_id": "solid-01", "answer": "a"},
            {"question_id": "solid-02", "answer": "b"},
            {"question_id": "solid-03", "answer": "true"},
            {"question_id": "solid-04", "answer": ["a", "b", "d"]},
            {"question_id": "solid-05", "answer": "c"},
            {"question_id": "solid-06", "answer": "true"},
            {"question_id": "solid-07", "answer": ["a", "b"]},
            {"question_id": "solid-08", "answer": "a"},
            {
                "question_id": "solid-09",
                "answer": {"challengeId": "solid-cube-parts", "passed": True},
            },
            {
                "question_id": "solid-10",
                "answer": {"challengeId": "solid-cylinder-surfaces", "passed": True},
            },
        ]

    def math_task(self) -> dict[str, object]:
        response = self.client.get("/api/v1/me/tasks/today", headers=self.student_headers)
        self.assertEqual(response.status_code, 200)
        return next(task for task in response.json()["tasks"] if task["id"] == "math-shapes-diagnosis")

    def test_new_student_must_select_registered_course_context_before_today_tasks(self) -> None:
        catalog = self.client.get("/api/v1/me/course-catalog", headers=self.student_headers)
        current = self.client.get("/api/v1/me/course-context", headers=self.student_headers)
        tasks = self.client.get("/api/v1/me/tasks/today", headers=self.student_headers)

        self.assertEqual(catalog.status_code, 200)
        self.assertEqual(current.status_code, 200)
        self.assertIsNone(current.json()["context"])
        self.assertEqual(tasks.status_code, 409)
        self.assertTrue(tasks.json()["course_context_required"])
        self.assertIsNone(tasks.headers.get("X-AI-Coach-Session-Context-Changed"))
        courses = catalog.json()["courses"]
        self.assertEqual(len(courses), 1)
        self.assertEqual(courses[0]["subject"], "数学")
        self.assertEqual(courses[0]["textbook_version"], "北师大版")
        self.assertEqual(courses[0]["chapters"][0]["id"], "g7u-chapter-1")
        self.assertEqual(
            [item["id"] for item in courses[0]["chapters"][0]["knowledge_points"]],
            [
                "g7u-shapes-solid",
                "g7u-shapes-folding",
                "g7u-shapes-section",
                "g7u-shapes-views",
            ],
        )

    def test_only_registered_course_chapter_and_knowledge_points_can_be_saved(self) -> None:
        unregistered = self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json={
                "course_id": "made-up-course",
                "chapter_id": "made-up-chapter",
                "knowledge_point_ids": ["made-up-knowledge"],
            },
        )
        mixed_chapter = self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json={
                **self.selected_context_payload("g7u-shapes-solid"),
                "chapter_id": "g8u-chapter-1",
            },
        )
        selected = self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-solid", "g7u-shapes-folding"),
        )
        fetched = self.client.get("/api/v1/me/course-context", headers=self.student_headers)

        self.assertEqual(unregistered.status_code, 400)
        self.assertEqual(mixed_chapter.status_code, 400)
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.json()["context"], fetched.json()["context"])
        self.assertEqual(
            [item["id"] for item in fetched.json()["context"]["knowledge_points"]],
            ["g7u-shapes-solid", "g7u-shapes-folding"],
        )
        self.assertNotIn("student-two", str(fetched.json()))

    @patch("app.services.student_workspace_service.is_subject_enabled", return_value=True)
    def test_today_math_task_snapshots_only_selected_knowledge_points_before_start(self, _visibility) -> None:
        self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-solid"),
        )
        initial = self.math_task()
        changed = self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-folding", "g7u-shapes-section"),
        )
        refreshed = self.math_task()
        supplementary = next(
            task
            for task in self.client.get("/api/v1/me/tasks/today", headers=self.student_headers).json()["tasks"]
            if task["id"] == "english-20"
        )

        self.assertEqual(changed.status_code, 200)
        self.assertEqual(
            [item["id"] for item in initial["course_context"]["knowledge_points"]],
            ["g7u-shapes-solid"],
        )
        self.assertEqual(
            [item["id"] for item in refreshed["course_context"]["knowledge_points"]],
            ["g7u-shapes-folding", "g7u-shapes-section"],
        )
        self.assertIsNone(supplementary["course_context"])

    def test_started_task_snapshot_is_immutable_and_rejects_evidence_outside_it(self) -> None:
        self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-solid"),
        )
        self.math_task()
        started = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/start",
            headers=self.student_headers,
        )
        switched = self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-folding"),
        )
        snapshot_after_switch = self.math_task()
        outside_evidence = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=self.student_headers,
            json={
                "reflection": "我完成了当前课程内容的图形诊断。",
                "evidence": {
                    "kind": "math_diagnosis",
                    "attempts": [{"question_id": "fold-01", "answer": "c"}],
                },
            },
        )
        valid_completion = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=self.student_headers,
            json={
                "reflection": "我完成了当前课程内容的图形诊断并复盘。",
                "evidence": {"kind": "math_diagnosis", "attempts": self.solid_attempts()},
            },
        )

        self.assertEqual(started.status_code, 200)
        self.assertEqual(switched.status_code, 200)
        self.assertEqual(
            [item["id"] for item in snapshot_after_switch["course_context"]["knowledge_points"]],
            ["g7u-shapes-solid"],
        )
        self.assertEqual(outside_evidence.status_code, 400)
        self.assertIn("当前课程", outside_evidence.json()["detail"])
        self.assertEqual(valid_completion.status_code, 200)

    def test_existing_legacy_started_task_stays_usable_without_new_context(self) -> None:
        student = self.service.get_current_user(
            self.student_headers["Authorization"].removeprefix("Bearer ")
        )
        task_date = self.service._today()
        self.repository.ensure_daily_tasks(
            user_id=student["id"],
            task_date=task_date,
            tasks=[
                {
                    "id": "math-shapes-diagnosis",
                    "subject": "数学",
                    "title": "旧版课堂诊断",
                    "objective": "迁移前已开始的任务。",
                    "learning_href": "/today-learning",
                    "growth_earned": 40,
                }
            ],
        )
        self.repository.start_daily_task(
            user_id=student["id"],
            task_date=task_date,
            task_id="math-shapes-diagnosis",
        )

        listed = self.client.get("/api/v1/me/tasks/today", headers=self.student_headers)
        completed = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=self.student_headers,
            json={
                "reflection": "我完成了迁移前课堂诊断并复盘。",
                "evidence": {"kind": "math_diagnosis", "attempts": self.solid_attempts()},
            },
        )

        self.assertEqual(listed.status_code, 200)
        self.assertIsNone(listed.json()["tasks"][0]["course_context"])
        self.assertEqual(completed.status_code, 200)

    def test_math_variant_generation_is_limited_to_current_course_context(self) -> None:
        class FakeRuntimeService:
            def __init__(self) -> None:
                self.calls = 0

            def generate_math_variant(self, request):
                self.calls += 1
                return MathQuestionGenerationResponse.model_validate(
                    {
                        "question": {
                            "id": "ai-course-context-solid",
                            "knowledge_point_id": request.knowledge_point_id,
                            "capability_tag": request.capability_tag,
                            "difficulty": request.difficulty,
                            "response_type": "single-choice",
                            "prompt": "圆柱有几个圆形底面？",
                            "options": [{"id": "a", "text": "1个"}, {"id": "b", "text": "2个"}],
                            "correct_answer": "b",
                            "explanation": "圆柱有两个圆形底面。",
                            "visual": {"kind": "solid-model", "solid": "cylinder"},
                            "source": "ai-generated",
                        },
                        "model_name": "test",
                        "latency_ms": 1,
                    }
                )

        runtime_service = FakeRuntimeService()
        app.dependency_overrides[get_ai_runtime_service] = lambda: runtime_service
        shared_payload = {
            "capability_tag": "结构识别",
            "difficulty": "basic",
            "response_type": "single-choice",
        }
        no_context = self.client.post(
            "/api/v1/me/math-variant-questions",
            headers=self.student_headers,
            json={**shared_payload, "knowledge_point_id": "g7u-shapes-solid"},
        )
        self.client.put(
            "/api/v1/me/course-context",
            headers=self.student_headers,
            json=self.selected_context_payload("g7u-shapes-solid"),
        )
        outside_context = self.client.post(
            "/api/v1/me/math-variant-questions",
            headers=self.student_headers,
            json={**shared_payload, "knowledge_point_id": "g7u-shapes-folding"},
        )
        generated = self.client.post(
            "/api/v1/me/math-variant-questions",
            headers=self.student_headers,
            json={**shared_payload, "knowledge_point_id": "g7u-shapes-solid"},
        )
        student = self.service.get_current_user(
            self.student_headers["Authorization"].removeprefix("Bearer ")
        )
        stored = self.repository.get_math_variant_answer_record(
            user_id=student["id"],
            question_id="ai-course-context-solid",
        )

        self.assertEqual(no_context.status_code, 409)
        self.assertTrue(no_context.json()["course_context_required"])
        self.assertEqual(outside_context.status_code, 400)
        self.assertEqual(generated.status_code, 200)
        self.assertEqual(runtime_service.calls, 1)
        self.assertEqual(stored["knowledge_point_id"], "g7u-shapes-solid")


if __name__ == "__main__":
    unittest.main()
