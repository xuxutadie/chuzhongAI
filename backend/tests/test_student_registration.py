"""自主注册与教师创建账号的来源、权限和限流回归测试。"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api.routes.student_workspace import get_student_workspace_service
from app.main import app
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService


class StudentRegistrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.repository = StudentWorkspaceRepository(
            Path(self.temporary_directory.name) / "registration.db"
        )
        self.service = StudentWorkspaceService(self.repository)
        StudentWorkspaceService._clear_login_attempts_for_testing()
        self.clear_registration_limits()
        app.dependency_overrides[get_student_workspace_service] = lambda: self.service
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.clear_registration_limits()
        self.client.close()
        self.temporary_directory.cleanup()

    @staticmethod
    def clear_registration_limits() -> None:
        # 首次红灯运行时方法尚不存在，仍需让接口测试真正验证 404。
        clear = getattr(StudentWorkspaceService, "_clear_registration_attempts_for_testing", None)
        if clear is not None:
            clear()

    @staticmethod
    def registration_payload(username: str = "personal-student") -> dict[str, str]:
        return {
            "username": username,
            "password": "registration-test-123",
            "display_name": "自主学习同学",
            "grade": "初一",
        }

    @staticmethod
    def authorization(payload: dict) -> dict[str, str]:
        return {"Authorization": f"Bearer {payload['access_token']}"}

    def register(self, username: str = "personal-student") -> dict:
        response = self.client.post(
            "/api/v1/auth/register", json=self.registration_payload(username)
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_student_can_register_before_first_teacher_and_keep_personal_mode(self) -> None:
        account = self.register()
        self.assertEqual(account["user"]["role"], "student")
        self.assertEqual(account["user"]["ai_access_mode"], "personal")
        self.assertEqual(account["token_type"], "bearer")
        self.assertTrue(account["expires_at"])
        for secret_field in ("created_by", "password", "password_hash", "auth_version"):
            self.assertNotIn(secret_field, account["user"])
        stored = self.repository.get_user_by_username("personal-student")
        self.assertIsNone(stored["created_by"])
        self.assertNotEqual(stored["password_hash"], self.registration_payload()["password"])
        for path in ("/api/v1/auth/me", "/api/v1/me/profile"):
            response = self.client.get(path, headers=self.authorization(account))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["ai_access_mode"], "personal")
        login = self.client.post(
            "/api/v1/auth/login",
            json={"username": "PERSONAL-STUDENT", "password": "registration-test-123"},
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["user"]["ai_access_mode"], "personal")
        teacher = self.client.post(
            "/api/v1/auth/bootstrap",
            json={"username": "teacher", "password": "teacher-test-123", "display_name": "老师"},
        )
        self.assertEqual(teacher.status_code, 201)
        self.assertEqual(teacher.json()["user"]["ai_access_mode"], "managed")

    def test_teacher_created_students_remain_managed_in_every_public_response(self) -> None:
        teacher = self.service.bootstrap_admin(
            username="teacher", password="teacher-test-123", display_name="老师"
        )
        created = self.client.post(
            "/api/v1/teacher/students",
            headers=self.authorization(teacher),
            json=self.registration_payload("managed-student"),
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()["user"]["ai_access_mode"], "managed")
        listed = self.client.get(
            "/api/v1/teacher/students", headers=self.authorization(teacher)
        )
        self.assertEqual(listed.json()["students"][0]["ai_access_mode"], "managed")
        login = self.service.login(username="managed-student", password="registration-test-123")
        self.assertEqual(login["user"]["ai_access_mode"], "managed")
        for path in ("/api/v1/auth/me", "/api/v1/me/profile"):
            response = self.client.get(path, headers=self.authorization(login))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["user"]["ai_access_mode"], "managed")

    def test_registration_rejects_role_ownership_and_ai_mode_injection(self) -> None:
        for field, value in (("role", "admin"), ("created_by", 1), ("ai_access_mode", "managed")):
            with self.subTest(field=field):
                response = self.client.post(
                    "/api/v1/auth/register",
                    json={**self.registration_payload(), field: value},
                )
                self.assertEqual(response.status_code, 422)
                self.assertIsNone(self.repository.get_user_by_username("personal-student"))

    def test_registration_rejects_invalid_identity_and_grade_fields(self) -> None:
        invalid_values = (
            ("username", "ab", 422),
            ("username", "two words", 400),
            ("password", "short", 422),
            ("display_name", "   ", 400),
            ("grade", "级" * 25, 422),
        )
        for field, value, expected_status in invalid_values:
            with self.subTest(field=field, value=value):
                response = self.client.post(
                    "/api/v1/auth/register", json={**self.registration_payload(), field: value}
                )
                self.assertEqual(response.status_code, expected_status)
                self.assertIsNone(self.repository.get_user_by_username("personal-student"))

    def test_optional_grade_and_trimmed_names_are_supported(self) -> None:
        response = self.client.post(
            "/api/v1/auth/register",
            json={**self.registration_payload(), "username": "  student-trim  ",
                  "display_name": "  同学  ", "grade": None},
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["username"], "student-trim")
        self.assertEqual(response.json()["user"]["display_name"], "同学")
        self.assertIsNone(response.json()["user"]["grade"])

    def test_duplicate_username_is_case_insensitive_and_preserves_existing_account(self) -> None:
        first = self.register()
        duplicate = self.client.post(
            "/api/v1/auth/register", json=self.registration_payload("PERSONAL-STUDENT")
        )
        self.assertEqual(duplicate.status_code, 409)
        original = self.client.get("/api/v1/auth/me", headers=self.authorization(first))
        self.assertEqual(original.status_code, 200)
        self.assertEqual(original.json()["user"]["id"], first["user"]["id"])

    def test_registered_students_cannot_manage_students_or_access_other_workspaces(self) -> None:
        first = self.register("first-student")
        second = self.register("second-student")
        write = self.client.put(
            "/api/v1/workspace/state", headers=self.authorization(first),
            json={"state": {"draft": "第一位学生自己的草稿"}},
        )
        self.assertEqual(write.status_code, 200)
        second_state = self.client.get("/api/v1/workspace/state", headers=self.authorization(second))
        self.assertEqual(second_state.json()["state"], {})
        self.assertEqual(self.client.get("/api/v1/workspace/state").status_code, 401)
        self.assertEqual(self.client.get(
            "/api/v1/teacher/students", headers=self.authorization(first)
        ).status_code, 403)
        self.assertEqual(self.client.post(
            "/api/v1/teacher/students", headers=self.authorization(first),
            json=self.registration_payload("forged-managed"),
        ).status_code, 403)

    def test_registration_rate_limit_ignores_spoofed_forwarded_headers_and_expires(self) -> None:
        with patch.object(StudentWorkspaceService, "_maximum_registration_attempts", 2, create=True):
            with patch("app.services.student_workspace_service.time.monotonic", return_value=1_000.0):
                self.register("limited-one")
                self.register("limited-two")
                rejected = self.client.post(
                    "/api/v1/auth/register", json=self.registration_payload("limited-three"),
                    headers={"X-Forwarded-For": "203.0.113.99", "X-Real-IP": "203.0.113.98"},
                )
                self.assertEqual(rejected.status_code, 429)
                self.assertGreater(int(rejected.headers["Retry-After"]), 0)
                self.assertIn("注册", rejected.json()["detail"])
                self.assertIsNone(self.repository.get_user_by_username("limited-three"))
            with patch("app.services.student_workspace_service.time.monotonic", return_value=2_000.0):
                self.register("limited-three")

    def test_registration_limiter_bounds_active_source_buckets_without_evicting_them(self) -> None:
        self.assertTrue(hasattr(StudentWorkspaceService, "_require_registration_allowed"))
        with patch.object(StudentWorkspaceService, "_maximum_registration_sources", 2):
            with patch("app.services.student_workspace_service.time.monotonic", return_value=1_000.0):
                StudentWorkspaceService._require_registration_allowed("source-one")
                StudentWorkspaceService._require_registration_allowed("source-two")
                with self.assertRaises(Exception) as rejected:
                    StudentWorkspaceService._require_registration_allowed("source-three")
                self.assertEqual(rejected.exception.status_code, 429)
                self.assertEqual(len(StudentWorkspaceService._registration_attempts), 2)
                self.assertIn("source-one", StudentWorkspaceService._registration_attempts)
            with patch("app.services.student_workspace_service.time.monotonic", return_value=2_000.0):
                StudentWorkspaceService._require_registration_allowed("source-three")
                self.assertEqual(set(StudentWorkspaceService._registration_attempts), {"source-three"})

    def test_teacher_can_create_managed_students_in_a_batch_without_returning_passwords(self) -> None:
        teacher = self.service.bootstrap_admin(
            username="teacher", password="teacher-test-123", display_name="老师"
        )
        response = self.client.post(
            "/api/v1/teacher/students/batch", headers=self.authorization(teacher),
            json={"students": [self.registration_payload("batch-one"),
                               self.registration_payload("batch-two")]},
        )
        self.assertEqual(response.status_code, 201, response.text)
        students = response.json()["students"]
        self.assertEqual([student["username"] for student in students], ["batch-one", "batch-two"])
        for student in students:
            self.assertEqual(student["role"], "student")
            self.assertEqual(student["ai_access_mode"], "managed")
            self.assertNotIn("password", student)
            self.assertNotIn("password_hash", student)
            stored = self.repository.get_user_by_username(student["username"])
            self.assertEqual(stored["created_by"], teacher["user"]["id"])
            login = self.service.login(username=student["username"], password="registration-test-123")
            self.assertEqual(login["user"]["ai_access_mode"], "managed")

    def test_batch_creation_rolls_back_all_students_when_any_username_exists(self) -> None:
        teacher = self.service.bootstrap_admin(
            username="teacher", password="teacher-test-123", display_name="老师"
        )
        self.service.create_student(teacher=teacher["user"], **self.registration_payload("already-exists"))
        response = self.client.post(
            "/api/v1/teacher/students/batch", headers=self.authorization(teacher),
            json={"students": [self.registration_payload("must-roll-back"),
                               self.registration_payload("ALREADY-EXISTS")]},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIsNone(self.repository.get_user_by_username("must-roll-back"))
        self.assertEqual(len(self.repository.list_students(teacher["user"]["id"])), 1)

    def test_batch_creation_validates_all_rows_and_case_insensitive_duplicates_before_writing(self) -> None:
        teacher = self.service.bootstrap_admin(
            username="teacher", password="teacher-test-123", display_name="老师"
        )
        cases = (
            ([self.registration_payload("batch-one"), self.registration_payload("BATCH-ONE")], 409),
            ([self.registration_payload("batch-one"),
              {**self.registration_payload("batch-two"), "display_name": "   "}], 400),
            ([self.registration_payload("batch-one"),
              {**self.registration_payload("batch-two"), "role": "admin"}], 422),
            ([self.registration_payload("batch-one"),
              {**self.registration_payload("batch-two"), "created_by": 999}], 422),
        )
        for rows, expected_status in cases:
            with self.subTest(rows=rows):
                response = self.client.post(
                    "/api/v1/teacher/students/batch", headers=self.authorization(teacher),
                    json={"students": rows},
                )
                self.assertEqual(response.status_code, expected_status)
                self.assertEqual(self.repository.list_students(teacher["user"]["id"]), [])

    def test_batch_creation_requires_teacher_role_and_rejects_unbounded_or_extra_input(self) -> None:
        teacher = self.service.bootstrap_admin(
            username="teacher", password="teacher-test-123", display_name="老师"
        )
        rows = [self.registration_payload("batch-one")]
        self.assertEqual(self.client.post(
            "/api/v1/teacher/students/batch", json={"students": rows}
        ).status_code, 401)
        student = self.register()
        self.assertEqual(self.client.post(
            "/api/v1/teacher/students/batch", headers=self.authorization(student),
            json={"students": rows},
        ).status_code, 403)
        for payload in ({"students": []}, {"students": rows * 51},
                        {"students": rows, "created_by": 999}):
            response = self.client.post(
                "/api/v1/teacher/students/batch", headers=self.authorization(teacher), json=payload
            )
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.repository.list_students(teacher["user"]["id"]), [])


if __name__ == "__main__":
    unittest.main()
