"""全册静态能力包接入、可信判分与原记录兼容。"""
import tempfile
import unittest
from pathlib import Path

from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import (
    REGISTERED_COURSE_CATALOG, MATH_DIAGNOSIS_ANSWER_KEY,
    StudentWorkspaceService, StudentWorkspaceError,
)


class FullMathCurriculumTests(unittest.TestCase):
    def test_new_chapters_can_be_selected_started_and_completed_through_real_api(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from app.api.routes.student_workspace import get_student_workspace_service
        from app.services.math_curriculum import ADDITIONAL_CHAPTERS
        with tempfile.TemporaryDirectory() as folder:
            service = StudentWorkspaceService(StudentWorkspaceRepository(Path(folder) / "api.db"))
            app.dependency_overrides[get_student_workspace_service] = lambda: service
            try:
                with TestClient(app) as client:
                    teacher = client.post("/api/v1/auth/bootstrap", json={
                        "username": "curriculum-teacher", "password": "TestOnly!2026", "display_name": "验收教师",
                    })
                    self.assertEqual(teacher.status_code, 201, teacher.text)
                    teacher_headers = {"Authorization": "Bearer " + teacher.json()["access_token"]}
                    for number, chapter in enumerate(ADDITIONAL_CHAPTERS, 2):
                        username = f"curriculum-student-{number}"
                        created = client.post("/api/v1/teacher/students", headers=teacher_headers, json={
                            "username": username, "password": "TestOnly!2026", "display_name": "章节验收学生",
                        })
                        self.assertEqual(created.status_code, 201)
                        login = client.post("/api/v1/auth/login", json={"username": username, "password": "TestOnly!2026"})
                        headers = {"Authorization": "Bearer " + login.json()["access_token"]}
                        selected = client.put("/api/v1/me/course-context", headers=headers, json={
                            "course_id": "nnu-math-g7-upper", "chapter_id": chapter["id"],
                            "knowledge_point_ids": [p["id"] for p in chapter["packages"]],
                        })
                        self.assertEqual(selected.status_code, 200, selected.text)
                        tasks = client.get("/api/v1/me/tasks/today", headers=headers)
                        self.assertEqual(tasks.status_code, 200)
                        self.assertEqual(tasks.json()["tasks"][0]["course_context"]["chapter_id"], chapter["id"])
                        started = client.post("/api/v1/me/tasks/math-shapes-diagnosis/start", headers=headers)
                        self.assertEqual(started.status_code, 200)
                        # 四个知识点均使用新的过关题凭据，检查答案表、归属和完成链路一致。
                        evidence = {"kind": "math_diagnosis", "attempts": [
                            {"question_id": q["id"], "answer": q["correctAnswer"]}
                            for pack in chapter["packages"] for q in pack["retestQuestions"]
                        ]}
                        completed = client.post("/api/v1/me/tasks/math-shapes-diagnosis/complete", headers=headers, json={
                            "reflection": "我已复习本章四个知识点并通过过关测试。", "evidence": evidence,
                        })
                        self.assertEqual(completed.status_code, 200, completed.text)
                        saved = client.get("/api/v1/me/tasks/today", headers=headers)
                        self.assertEqual(saved.json()["tasks"][0]["status"], "completed")
            finally:
                app.dependency_overrides.clear()

    def test_all_six_chapters_are_registered(self):
        chapters = REGISTERED_COURSE_CATALOG[0]["chapters"]
        self.assertEqual([c["id"] for c in chapters], [f"g7u-chapter-{n}" for n in range(1, 7)])
        self.assertTrue(all(len(c["knowledge_points"]) == 4 for c in chapters))

    def test_every_new_bank_has_trusted_answers_and_rejects_cross_chapter_submission(self):
        from app.services.math_curriculum import ADDITIONAL_CHAPTERS
        with tempfile.TemporaryDirectory() as folder:
            service = StudentWorkspaceService(StudentWorkspaceRepository(Path(folder) / "test.db"))
            for chapter in ADDITIONAL_CHAPTERS:
                for pack in chapter["packages"]:
                    for bank in (pack["questions"], pack["retestQuestions"]):
                        attempts = [{"question_id": q["id"], "answer": q["correctAnswer"]} for q in bank]
                        for question in bank:
                            self.assertEqual(MATH_DIAGNOSIS_ANSWER_KEY[question["id"]], question["correctAnswer"])
                            self.assertEqual(service._math_question_knowledge_point_id(1, question["id"]), pack["id"])
                            self.assertFalse(service._is_trusted_math_answer(1, question["id"], "fake-answer"))
                        service._validate_task_completion_evidence(
                            user_id=1, task_id="math-shapes-diagnosis", reflection="我完成了本知识点的诊断并复习错题。",
                            evidence={"kind": "math_diagnosis", "attempts": attempts},
                            allowed_knowledge_point_ids={pack["id"]},
                        )
                        with self.assertRaises(StudentWorkspaceError):
                            service._validate_task_completion_evidence(
                                user_id=1, task_id="math-shapes-diagnosis", reflection="本次提交了不属于当前章节的题目。",
                                evidence={"kind": "math_diagnosis", "attempts": attempts},
                                allowed_knowledge_point_ids={"g7u-shapes-solid"},
                            )
            self.assertEqual(MATH_DIAGNOSIS_ANSWER_KEY["solid-02"], "b")
            self.assertFalse(service._is_trusted_math_answer(1, "g7u-c2-fake-d01", "a"))
