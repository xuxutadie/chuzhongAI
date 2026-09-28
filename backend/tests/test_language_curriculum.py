"""用临时数据库验证语言单元独立学习、可信判分及旧数学任务兼容。"""
from copy import deepcopy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from app.main import app
from app.api.routes.student_workspace import get_student_workspace_service
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService
from app.services import language_curriculum
from app.services.language_curriculum import LANGUAGE_BOOKS, LANGUAGE_TASKS


class LanguageCurriculumTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp.name) / "test.db"
        self.service = StudentWorkspaceService(StudentWorkspaceRepository(self.database_path))
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        self.client = TestClient(app)
        StudentWorkspaceService._clear_login_attempts_for_testing()
        teacher = self.client.post("/api/v1/auth/bootstrap", json={
            "username": "language-teacher", "password": "TestOnly!2026", "display_name": "验收教师"})
        self.teacher = {"Authorization": "Bearer " + teacher.json()["access_token"]}
        self.headers = self.student("language-student")

    def student(self, name):
        created = self.client.post("/api/v1/teacher/students", headers=self.teacher, json={
            "username": name, "password": "TestOnly!2026", "display_name": "单元验收学生"})
        self.assertEqual(created.status_code, 201, created.text)
        login = self.client.post("/api/v1/auth/login", json={"username": name, "password": "TestOnly!2026"})
        return {"Authorization": "Bearer " + login.json()["access_token"]}

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.temp.cleanup()

    @staticmethod
    def evidence(unit):
        return {"reflection": "我已经复习本单元的方法，并用新题检查了理解。", "evidence": {
            "kind": "language_unit",
            "diagnosis_answers": {q["id"]: q["options"][(next(i for i,o in enumerate(q["options"]) if o["id"] == q["answer"]) + 1) % 3]["id"] for q in unit["questions"]},
            "answers": {q["id"]: q["answer"] for q in unit["retestQuestions"]},
        }}

    def start(self, task_id, headers=None):
        return self.client.post(f"/api/v1/me/tasks/{task_id}/start", headers=headers or self.headers)

    def complete(self, task_id, payload):
        return self.client.post(f"/api/v1/me/tasks/{task_id}/complete", headers=self.headers, json=payload)

    def test_all_thirty_units_complete_without_math_or_api_and_survive_reloads(self):
        self.assertEqual([len(b["units"]) for b in LANGUAGE_BOOKS], [10, 8, 6, 6])
        self.assertEqual(len(LANGUAGE_TASKS), 30)
        for task_id, (book, unit) in LANGUAGE_TASKS.items():
            started = self.start(task_id)
            self.assertEqual(started.status_code, 200, started.text)
            self.assertEqual(started.json()["task"]["course_context"]["chapter_id"], unit["id"])
            completed = self.complete(task_id, self.evidence(unit))
            self.assertEqual(completed.status_code, 200, completed.text)
            self.assertEqual(completed.json()["task"]["status"], "completed")
            repeated = self.complete(task_id, self.evidence(unit))
            self.assertTrue(repeated.json()["was_already_completed"])
        today = self.client.get("/api/v1/me/tasks/today", headers=self.headers).json()
        self.assertEqual(len(today["tasks"]), 30)
        self.assertEqual(today["growth_earned"], 600)

        # 关闭原客户端并从同一数据库重建完整服务，验证结果不是进程内状态。
        self.client.close()
        self.service = StudentWorkspaceService(StudentWorkspaceRepository(self.database_path))
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        self.client = TestClient(app)
        records = self.client.get("/api/v1/me/language-progress", headers=self.headers).json()["units"]
        self.assertEqual(len(records), 30)
        self.assertTrue(all(r["completed_count"] == 1 for r in records))

    def test_incomplete_wrong_foreign_and_fake_answers_are_rejected(self):
        task_id, (_, unit) = next(iter(LANGUAGE_TASKS.items()))
        self.assertEqual(self.start(task_id).status_code, 200)
        for mutation in ("missing_first", "missing_retest", "wrong", "foreign", "kind", "reflection"):
            with self.subTest(mutation=mutation):
                payload = self.evidence(unit)
                if mutation == "missing_first": payload["evidence"]["diagnosis_answers"].pop(unit["questions"][0]["id"])
                if mutation == "missing_retest": payload["evidence"]["answers"].pop(unit["retestQuestions"][0]["id"])
                if mutation == "wrong": payload["evidence"]["answers"][unit["retestQuestions"][0]["id"]] = "fake"
                if mutation == "foreign": payload["evidence"]["answers"]["english-other-unit-r1"] = "a"
                if mutation == "kind": payload["evidence"]["kind"] = "guided_activity"
                if mutation == "reflection": payload["reflection"] = "完成"
                self.assertEqual(self.complete(task_id, payload).status_code, 400)
        self.assertEqual(self.client.get("/api/v1/me/tasks/today", headers=self.headers).json()["growth_earned"], 0)

    def test_history_is_read_only_and_account_isolated(self):
        self.assertEqual(self.client.get("/api/v1/me/language-progress", headers=self.headers).json(), {"units": []})
        response_schema = app.openapi()["paths"]["/api/v1/me/language-progress"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        self.assertEqual(response_schema["$ref"], "#/components/schemas/LanguageProgressResponse")
        self.assertEqual(self.client.get("/api/v1/me/tasks/today", headers=self.headers).status_code, 409)
        task_id, (_, unit) = next(iter(LANGUAGE_TASKS.items()))
        self.start(task_id)
        self.complete(task_id, self.evidence(unit))
        other = self.student("language-other")
        self.assertEqual(self.client.get("/api/v1/me/language-progress", headers=other).json(), {"units": []})
        self.assertEqual(self.client.get("/api/v1/me/language-progress").status_code, 401)
        self.assertEqual(self.start(task_id, self.teacher).status_code, 403)
        self.assertEqual(self.start("language-not-a-real-unit").status_code, 404)

    def test_selecting_math_after_language_preserves_both_and_does_not_lock_language(self):
        task_id, (_, unit) = next(iter(LANGUAGE_TASKS.items()))
        self.start(task_id)
        selected = self.client.put("/api/v1/me/course-context", headers=self.headers, json={
            "course_id": "nnu-math-g7-upper", "chapter_id": "g7u-chapter-2", "knowledge_point_ids": ["g7u-c2-rational"]})
        self.assertEqual(selected.status_code, 200, selected.text)
        self.assertEqual(self.start("math-shapes-diagnosis").status_code, 200)
        self.assertEqual(self.complete(task_id, self.evidence(unit)).status_code, 200)
        tasks = self.client.get("/api/v1/me/tasks/today", headers=self.headers).json()["tasks"]
        math = next(t for t in tasks if t["id"] == "math-shapes-diagnosis")
        self.assertEqual(math["status"], "in_progress")
        self.assertEqual(math["course_context"]["chapter_id"], "g7u-chapter-2")

    def test_next_day_can_relearn_and_history_retains_previous_completion(self):
        task_id, (_, unit) = next(iter(LANGUAGE_TASKS.items()))
        for day in ("2026-09-05", "2026-09-06"):
            with patch.object(self.service, "_today", return_value=day):
                self.assertEqual(self.start(task_id).status_code, 200)
                self.assertEqual(self.complete(task_id, self.evidence(unit)).status_code, 200)
                self.assertEqual(self.client.get("/api/v1/me/tasks/today", headers=self.headers).json()["growth_earned"], 20)
        history = self.client.get("/api/v1/me/language-progress", headers=self.headers).json()["units"][0]
        self.assertEqual(history["completed_count"], 2)
        self.assertEqual(history["last_studied_date"], "2026-09-06")

    def test_completion_requires_started_task_and_never_trusts_browser_workspace(self):
        items = list(LANGUAGE_TASKS.items())
        missing_id, (_, missing_unit) = items[1]
        not_started = self.complete(missing_id, self.evidence(missing_unit))
        self.assertEqual(not_started.status_code, 404)
        self.assertIn("开始", not_started.json()["detail"])
        self.start(items[0][0])
        self.assertEqual(self.complete(missing_id, self.evidence(missing_unit)).status_code, 404)
        self.client.put("/api/v1/workspace/state", headers=self.headers, json={"state": {"languageUnitDrafts": {missing_unit["id"]: {"phase": "completed", "score": 100}}}})
        self.assertEqual(self.complete(missing_id, self.evidence(missing_unit)).status_code, 404)

    def test_curriculum_validation_requires_exactly_three_options(self):
        books = deepcopy(LANGUAGE_BOOKS)
        question = books[0]["units"][0]["questions"][0]
        question["options"].append(deepcopy(question["options"][0]))

        with self.assertRaisesRegex(ValueError, "题目或答案无效"):
            language_curriculum.build_language_curriculum_indexes(books)

    def test_curriculum_validation_rejects_mismatched_book_identity(self):
        for field, invalid_value in (("id", "other-book"), ("subject", "语文"), ("grade", 8)):
            with self.subTest(field=field):
                books = deepcopy(LANGUAGE_BOOKS)
                books[0][field] = invalid_value
                with self.assertRaisesRegex(ValueError, "教材登记信息不一致"):
                    language_curriculum.build_language_curriculum_indexes(books)
