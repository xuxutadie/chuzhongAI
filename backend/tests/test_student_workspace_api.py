import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes.student_workspace import get_student_workspace_service, settings
from app.main import app
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService


class StudentWorkspaceApiTests(unittest.TestCase):
    def setUp(self) -> None:
        StudentWorkspaceService._clear_login_attempts_for_testing()
        self.temporary_directory = tempfile.TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "student-workspace.db"
        repository = StudentWorkspaceRepository(database_path)
        self.service = StudentWorkspaceService(repository, session_ttl_hours=12)
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.temporary_directory.cleanup()

    def bootstrap_admin(self) -> str:
        response = self.client.post(
            "/api/v1/auth/bootstrap",
            json={
                "username": "teacher-admin",
                "password": "safe-password-123",
                "display_name": "王老师",
            },
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["user"]["role"], "admin")
        self.assertNotIn("password", payload)
        self.assertNotIn("token_hash", payload)
        return payload["access_token"]

    @staticmethod
    def authorization(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    @staticmethod
    def passed_math_evidence() -> dict[str, object]:
        return {
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
                {"question_id": "solid-10", "answer": {"challengeId": "solid-cylinder-surfaces", "passed": True}},
            ],
        }

    def create_student(self, teacher_token: str, username: str, display_name: str) -> None:
        response = self.client.post(
            "/api/v1/teacher/students",
            headers=self.authorization(teacher_token),
            json={
                "username": username,
                "password": "safe-password-123",
                "display_name": display_name,
                "grade": "初一",
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["role"], "student")
        self.assertNotIn("password", response.json())

    def login(self, username: str) -> str:
        response = self.client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "safe-password-123"},
        )
        self.assertEqual(response.status_code, 200)
        access_token = response.json()["access_token"]

        # 学生端真实流程须先选择已导入课程；旧工作台用例默认选择第一章全部可信知识点。
        context_response = self.client.put(
            "/api/v1/me/course-context",
            headers=self.authorization(access_token),
            json={
                "course_id": "nnu-math-g7-upper",
                "chapter_id": "g7u-chapter-1",
                "knowledge_point_ids": [
                    "g7u-shapes-solid",
                    "g7u-shapes-folding",
                    "g7u-shapes-section",
                    "g7u-shapes-views",
                ],
            },
        )
        self.assertEqual(context_response.status_code, 200)
        return access_token

    def test_bootstrap_allows_exactly_one_first_admin(self) -> None:
        self.bootstrap_admin()

        second_response = self.client.post(
            "/api/v1/auth/bootstrap",
            json={
                "username": "other-admin",
                "password": "safe-password-123",
                "display_name": "李老师",
            },
        )

        self.assertEqual(second_response.status_code, 409)
        self.assertIsInstance(second_response.json()["detail"], str)

    def test_production_bootstrap_requires_the_configured_setup_code(self) -> None:
        payload = {
            "username": "teacher-admin",
            "password": "safe-password-123",
            "display_name": "王老师",
        }
        with (
            patch.object(settings, "app_env", "production"),
            patch.object(settings, "bootstrap_setup_code", ""),
        ):
            missing_server_configuration = self.client.post("/api/v1/auth/bootstrap", json=payload)
        with (
            patch.object(settings, "app_env", "production"),
            patch.object(settings, "bootstrap_setup_code", "first-admin-code"),
        ):
            missing_code = self.client.post("/api/v1/auth/bootstrap", json=payload)
            wrong_code = self.client.post(
                "/api/v1/auth/bootstrap",
                json={**payload, "setup_code": "wrong-code"},
            )
            valid_code = self.client.post(
                "/api/v1/auth/bootstrap",
                json={**payload, "setup_code": "first-admin-code"},
            )

        self.assertEqual(missing_server_configuration.status_code, 503)
        self.assertEqual(missing_code.status_code, 403)
        self.assertEqual(wrong_code.status_code, 403)
        self.assertEqual(valid_code.status_code, 201)

    def test_login_is_throttled_after_repeated_failures_and_success_clears_prior_failures(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        invalid_credentials = {"username": "student-one", "password": "wrong-password"}

        for _ in range(4):
            self.assertEqual(self.client.post("/api/v1/auth/login", json=invalid_credentials).status_code, 401)
        self.assertEqual(
            self.client.post(
                "/api/v1/auth/login",
                json={"username": "student-one", "password": "safe-password-123"},
            ).status_code,
            200,
        )

        for _ in range(5):
            self.assertEqual(self.client.post("/api/v1/auth/login", json=invalid_credentials).status_code, 401)
        throttled = self.client.post("/api/v1/auth/login", json=invalid_credentials)

        self.assertEqual(throttled.status_code, 429)
        self.assertTrue(throttled.headers.get("retry-after", "").isdigit())

    def test_student_session_cannot_read_another_students_workspace_or_use_teacher_route(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        self.create_student(teacher_token, "student-two", "学生二号")
        first_token = self.login("student-one")
        second_token = self.login("student-two")

        save_response = self.client.put(
            "/api/v1/workspace/state",
            headers=self.authorization(first_token),
            json={"state": {"mathDraft": {"currentStep": "diagnosis", "answer": "B"}}},
        )
        second_state = self.client.get(
            "/api/v1/workspace/state",
            headers=self.authorization(second_token),
        )
        blocked_teacher_route = self.client.get(
            "/api/v1/teacher/students",
            headers=self.authorization(first_token),
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(second_state.status_code, 200)
        self.assertEqual(second_state.json()["state"], {})
        self.assertEqual(blocked_teacher_route.status_code, 403)

    def test_workspace_state_has_a_bounded_payload_size(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")

        response = self.client.put(
            "/api/v1/workspace/state",
            headers=self.authorization(student_token),
            json={"state": {"oversized": "x" * (256 * 1024)}},
        )

        self.assertEqual(response.status_code, 413)
        self.assertIsInstance(response.json()["detail"], str)

    def test_current_user_and_workspace_never_accept_a_client_supplied_student_id(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")

        current_user = self.client.get("/api/v1/auth/me", headers=self.authorization(student_token))
        profile = self.client.get("/api/v1/me/profile", headers=self.authorization(student_token))
        unauthenticated = self.client.get("/api/v1/workspace/state")

        self.assertEqual(current_user.status_code, 200)
        self.assertEqual(current_user.json()["user"]["username"], "student-one")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()["user"]["display_name"], "学生一号")
        self.assertEqual(unauthenticated.status_code, 401)

    def test_today_task_completion_is_persistent_and_idempotent_per_student(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        self.create_student(teacher_token, "student-two", "学生二号")
        first_token = self.login("student-one")
        second_token = self.login("student-two")

        tasks_response = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(first_token),
        )
        self.assertEqual(tasks_response.status_code, 200)
        first_task_id = tasks_response.json()["tasks"][0]["id"]
        start_response = self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/start",
            headers=self.authorization(first_token),
        )
        first_completion = self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/complete",
            headers=self.authorization(first_token),
            json={
                "reflection": "我检查了图形的结构和条件，再完成课堂诊断。",
                "evidence": self.passed_math_evidence(),
            },
        )
        repeated_completion = self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/complete",
            headers=self.authorization(first_token),
            json={
                "reflection": "这次不应覆盖第一次的学习反思。",
                "evidence": self.passed_math_evidence(),
            },
        )
        other_student_tasks = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(second_token),
        )

        self.assertEqual(start_response.status_code, 200)
        self.assertEqual(first_completion.status_code, 200)
        self.assertFalse(first_completion.json()["was_already_completed"])
        self.assertEqual(repeated_completion.status_code, 200)
        self.assertTrue(repeated_completion.json()["was_already_completed"])
        self.assertEqual(repeated_completion.json()["task"]["reflection"], "我检查了图形的结构和条件，再完成课堂诊断。")
        self.assertEqual(other_student_tasks.status_code, 200)
        self.assertEqual(other_student_tasks.json()["growth_earned"], 0)
        self.assertEqual(other_student_tasks.json()["tasks"][0]["status"], "not_started")

    @patch("app.services.student_workspace_service.is_subject_enabled", return_value=True)
    def test_student_cannot_start_a_later_task_before_finishing_the_previous_one(self, _visibility) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")

        response = self.client.post(
            "/api/v1/me/tasks/english-20/start",
            headers=self.authorization(student_token),
        )
        tasks_response = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(student_token),
        )

        self.assertEqual(response.status_code, 409)
        self.assertIsNone(response.headers.get("X-AI-Coach-Session-Context-Changed"))
        tasks = {task["id"]: task for task in tasks_response.json()["tasks"]}
        self.assertEqual(tasks["math-shapes-diagnosis"]["status"], "not_started")
        self.assertEqual(tasks["english-20"]["status"], "not_started")

    def test_today_task_cannot_complete_before_it_is_started(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")
        first_task_id = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(student_token),
        ).json()["tasks"][0]["id"]

        completion = self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/complete",
            headers=self.authorization(student_token),
            json={
                "reflection": "我不应该跳过学习步骤后直接标记完成。",
                "evidence": self.passed_math_evidence(),
            },
        )

        self.assertEqual(completion.status_code, 409)
        self.assertIsInstance(completion.json()["detail"], str)

    def test_completion_requires_passing_task_evidence(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")
        first_task_id = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(student_token),
        ).json()["tasks"][0]["id"]
        self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/start",
            headers=self.authorization(student_token),
        )

        completion = self.client.post(
            f"/api/v1/me/tasks/{first_task_id}/complete",
            headers=self.authorization(student_token),
            json={
                "reflection": "我以为只写一句话就可以完成今天的数学学习。",
                "evidence": {
                    **self.passed_math_evidence(),
                    "attempts": [
                        *self.passed_math_evidence()["attempts"][:-1],
                        {"question_id": "solid-10", "answer": {"challengeId": "solid-cylinder-surfaces", "passed": False}},
                    ],
                },
            },
        )

        self.assertEqual(completion.status_code, 400)
        self.assertIsInstance(completion.json()["detail"], str)

    def test_text_fallback_answers_must_use_registered_questions_and_cannot_duplicate_a_base_question(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")
        headers = self.authorization(student_token)
        self.assertEqual(
            self.client.post(
                "/api/v1/me/tasks/math-shapes-diagnosis/start",
                headers=headers,
            ).status_code,
            200,
        )

        forged_completion = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=headers,
            json={
                "reflection": "我不能把任意题目伪造成文字备用题来完成诊断。",
                "evidence": {
                    "kind": "math_diagnosis",
                    "attempts": [
                        {"question_id": f"solid-{index:02d}-text-fallback", "answer": "true"}
                        for index in range(1, 11)
                    ],
                },
            },
        )
        self.assertEqual(forged_completion.status_code, 400)

        valid_fallback_completion = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=headers,
            json={
                "reflection": "图形加载失败后，我仍认真完成了十道文字备用题。",
                "evidence": {
                    "kind": "math_diagnosis",
                    "attempts": [
                        {"question_id": "solid-02-text-fallback", "answer": "b"},
                        {"question_id": "solid-03-text-fallback", "answer": "true"},
                        {"question_id": "solid-05-text-fallback", "answer": "c"},
                        {"question_id": "solid-06-text-fallback", "answer": "true"},
                        {"question_id": "solid-09-text-fallback", "answer": "true"},
                        {"question_id": "solid-10-text-fallback", "answer": "true"},
                        {"question_id": "fold-02-text-fallback", "answer": "false"},
                        {"question_id": "fold-03-text-fallback", "answer": "c"},
                        {"question_id": "fold-05-text-fallback", "answer": "true"},
                        {"question_id": "fold-08-text-fallback", "answer": "b"},
                    ],
                },
            },
        )
        self.assertEqual(valid_fallback_completion.status_code, 200)

    def test_text_fallback_cannot_be_submitted_alongside_its_original_question(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")
        headers = self.authorization(student_token)
        self.client.post("/api/v1/me/tasks/math-shapes-diagnosis/start", headers=headers)

        attempts = self.passed_math_evidence()["attempts"]
        duplicated_attempts = [
            *attempts[:9],
            {"question_id": "solid-02-text-fallback", "answer": "b"},
        ]
        response = self.client.post(
            "/api/v1/me/tasks/math-shapes-diagnosis/complete",
            headers=headers,
            json={
                "reflection": "同一道题的图形版和文字版不能重复计数。",
                "evidence": {"kind": "math_diagnosis", "attempts": duplicated_attempts},
            },
        )

        self.assertEqual(response.status_code, 400)

    @patch("app.services.student_workspace_service.is_subject_enabled", return_value=True)
    def test_guided_task_completion_recalculates_answers_on_the_server(self, _visibility) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")
        headers = self.authorization(student_token)
        math_task_id = self.client.get("/api/v1/me/tasks/today", headers=headers).json()["tasks"][0]["id"]
        self.client.post(f"/api/v1/me/tasks/{math_task_id}/start", headers=headers)
        self.assertEqual(
            self.client.post(
                f"/api/v1/me/tasks/{math_task_id}/complete",
                headers=headers,
                json={
                    "reflection": "我已完成图形课堂诊断并记录了关键结构。",
                    "evidence": self.passed_math_evidence(),
                },
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.post("/api/v1/me/tasks/english-20/start", headers=headers).status_code,
            200,
        )

        all_wrong_completion = self.client.post(
            "/api/v1/me/tasks/english-20/complete",
            headers=headers,
            json={
                "reflection": "我已经写了一段足够长的英语学习总结，但是自测全错。",
                "evidence": {
                    "kind": "guided_activity",
                    "answers": {
                        "english-q1": "progress",
                        "english-q2": "预习",
                        "english-q3": "Progress is a habit.",
                    },
                },
            },
        )
        valid_completion = self.client.post(
            "/api/v1/me/tasks/english-20/complete",
            headers=headers,
            json={
                "reflection": "每天复习会形成好习惯，也能让我越来越自信。",
                "evidence": {
                    "kind": "guided_activity",
                    "answers": {
                        "english-q1": "habit",
                        "english-q2": "复习",
                        "english-q3": "Progress is a habit.",
                    },
                },
            },
        )

        self.assertEqual(all_wrong_completion.status_code, 400)
        self.assertEqual(valid_completion.status_code, 200)

    def test_today_tasks_start_with_the_classroom_shapes_diagnostic(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")

        tasks = self.client.get(
            "/api/v1/me/tasks/today",
            headers=self.authorization(student_token),
        ).json()["tasks"]

        self.assertEqual(tasks[0]["id"], "math-shapes-diagnosis")
        self.assertEqual(tasks[0]["title"], "数学课堂诊断")
        self.assertEqual(tasks[0]["learning_href"], "/today-learning")

    def test_logout_revokes_the_only_bearer_token(self) -> None:
        teacher_token = self.bootstrap_admin()

        logout_response = self.client.post(
            "/api/v1/auth/logout",
            headers=self.authorization(teacher_token),
        )
        expired_response = self.client.get(
            "/api/v1/auth/me",
            headers=self.authorization(teacher_token),
        )

        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(logout_response.json()["detail"], "已退出登录")
        self.assertEqual(expired_response.status_code, 401)
        self.assertIsInstance(expired_response.json()["detail"], str)

    def test_teacher_can_reset_own_students_password_and_revoke_existing_sessions(self) -> None:
        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        student_token = self.login("student-one")

        reset_response = self.client.post(
            "/api/v1/teacher/students/2/reset-password",
            headers=self.authorization(teacher_token),
            json={"password": "new-safe-password-456"},
        )
        old_session = self.client.get(
            "/api/v1/auth/me",
            headers=self.authorization(student_token),
        )
        old_login = self.client.post(
            "/api/v1/auth/login",
            json={"username": "student-one", "password": "safe-password-123"},
        )
        new_login = self.client.post(
            "/api/v1/auth/login",
            json={"username": "student-one", "password": "new-safe-password-456"},
        )

        self.assertEqual(reset_response.status_code, 200)
        self.assertEqual(old_session.status_code, 401)
        self.assertEqual(old_login.status_code, 401)
        self.assertEqual(new_login.status_code, 200)

    def test_expected_user_id_blocks_a_stale_tab_from_using_another_accounts_session(self) -> None:
        """请求所属账号已切换时，服务端必须在任何工作台业务执行前拒绝它。"""

        teacher_token = self.bootstrap_admin()
        self.create_student(teacher_token, "student-one", "学生一号")
        self.create_student(teacher_token, "student-two", "学生二号")
        first_token = self.login("student-one")
        second_token = self.login("student-two")

        first_id = self.client.get(
            "/api/v1/auth/me", headers=self.authorization(first_token)
        ).json()["user"]["id"]
        second_id = self.client.get(
            "/api/v1/auth/me", headers=self.authorization(second_token)
        ).json()["user"]["id"]
        first_headers = {
            **self.authorization(first_token),
            "X-AI-Coach-Expected-User-Id": str(first_id),
        }
        stale_first_headers = {
            # 模拟 A 标签页请求迟到：共享 Cookie 已被 B 登录覆盖，但请求头仍来自 A 页面。
            **self.authorization(second_token),
            "X-AI-Coach-Expected-User-Id": str(first_id),
        }

        self.assertEqual(
            self.client.get("/api/v1/me/profile", headers=first_headers).status_code,
            200,
        )
        # 缺少新请求头的旧调用仍可工作，避免破坏直接 API 调用和既有测试。
        self.assertEqual(
            self.client.get("/api/v1/me/profile", headers=self.authorization(first_token)).status_code,
            200,
        )

        # 工作台写入和 AI 路由共用同一个认证护栏，均不能让过期标签页越过当前会话。
        stale_workspace_write = self.client.put(
            "/api/v1/workspace/state",
            headers=stale_first_headers,
            json={"state": {"draft": "不应写入"}},
        )
        stale_ai_read = self.client.get(
            "/api/v1/me/integrations",
            headers=stale_first_headers,
        )
        stale_upload = self.client.post(
            "/api/v1/wrong-questions/uploads",
            headers={**stale_first_headers, "Content-Type": "image/png"},
            content=b"\x89PNG\r\n\x1a\nstale-tab-upload",
        )

        self.assertEqual(stale_workspace_write.status_code, 409)
        self.assertEqual(stale_ai_read.status_code, 409)
        self.assertEqual(stale_upload.status_code, 409)
        self.assertEqual(
            stale_workspace_write.headers.get("X-AI-Coach-Session-Context-Changed"),
            "1",
        )
        self.assertEqual(
            stale_ai_read.headers.get("X-AI-Coach-Session-Context-Changed"),
            "1",
        )
        self.assertEqual(
            stale_upload.headers.get("X-AI-Coach-Session-Context-Changed"),
            "1",
        )
        self.assertIn("账号", stale_workspace_write.json()["detail"])
        self.assertNotIn("course_context_required", stale_workspace_write.json())
        self.assertEqual(
            self.client.get(
                "/api/v1/workspace/state",
                headers={
                    **self.authorization(second_token),
                    "X-AI-Coach-Expected-User-Id": str(second_id),
                },
            ).json()["state"],
            {},
        )

    def test_legacy_student_id_and_header_role_routes_are_not_public(self) -> None:
        public_paths = set(app.openapi()["paths"])
        forged_role_response = self.client.get(
            "/api/v1/auth/permission-check",
            headers={"X-User-Role": "admin"},
        )

        self.assertNotIn("/api/v1/students/{student_id}/tasks/{task_id}/start", public_paths)
        self.assertNotIn("/api/v1/students/{student_id}/tasks/{task_id}/complete", public_paths)
        self.assertNotIn("/api/v1/students/{student_id}/study-records", public_paths)
        self.assertNotIn("/api/v1/students/{student_id}/growth-records", public_paths)
        self.assertEqual(forged_role_response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
