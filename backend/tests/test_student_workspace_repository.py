import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from app.repositories.student_workspace_repository import StudentWorkspaceRepository


class StudentWorkspaceRepositoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary_directory.name) / "student-workspace.db"
        self.repository = StudentWorkspaceRepository(self.database_path)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_session_table_only_keeps_hashed_token(self) -> None:
        user = self.repository.create_user(
            username="student-one",
            password_hash="scrypt$test",
            display_name="学生一号",
            role="student",
            created_by=None,
        )
        raw_token = "only-the-client-and-proxy-may-see-this-token"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

        self.repository.create_session(
            user_id=user["id"],
            token_hash=token_hash,
            expires_at="2099-01-01T00:00:00+00:00",
        )

        connection = sqlite3.connect(self.database_path)
        try:
            stored_token = connection.execute(
                "SELECT token_hash FROM sessions WHERE user_id = ?",
                (user["id"],),
            ).fetchone()[0]
        finally:
            # Windows 上上下文管理器提交事务但不会关闭 SQLite 连接，必须显式释放文件句柄。
            connection.close()

        self.assertEqual(stored_token, token_hash)
        self.assertNotEqual(stored_token, raw_token)

    def test_workspace_state_is_scoped_to_its_owner(self) -> None:
        first_student = self.repository.create_user(
            username="student-one",
            password_hash="scrypt$test",
            display_name="学生一号",
            role="student",
            created_by=None,
        )
        second_student = self.repository.create_user(
            username="student-two",
            password_hash="scrypt$test",
            display_name="学生二号",
            role="student",
            created_by=None,
        )

        self.repository.save_workspace_state(first_student["id"], {"draft": {"answer": "A"}})

        self.assertEqual(
            self.repository.get_workspace_state(first_student["id"]),
            {"draft": {"answer": "A"}},
        )
        self.assertEqual(self.repository.get_workspace_state(second_student["id"]), {})

    def test_stale_session_version_is_invalid_after_teacher_resets_a_students_password(self) -> None:
        teacher = self.repository.create_user(
            username="teacher-one",
            password_hash="scrypt$teacher",
            display_name="教师一号",
            role="admin",
            created_by=None,
        )
        student = self.repository.create_user(
            username="student-one",
            password_hash="scrypt$old-password",
            display_name="学生一号",
            role="student",
            created_by=teacher["id"],
        )
        stale_token_hash = hashlib.sha256(b"stale-after-reset").hexdigest()

        self.assertTrue(
            self.repository.reset_owned_student_password(
                teacher_id=teacher["id"],
                student_id=student["id"],
                password_hash="scrypt$new-password",
            )
        )
        self.repository.create_session(
            user_id=student["id"],
            token_hash=stale_token_hash,
            auth_version=1,
            expires_at="2099-01-01T00:00:00+00:00",
        )

        self.assertIsNone(
            self.repository.get_session_user(stale_token_hash, "2026-09-05T00:00:00+00:00")
        )

    def test_wrong_questions_are_scoped_to_its_owner(self) -> None:
        first_student = self.repository.create_user(
            username="student-one",
            password_hash="scrypt$test",
            display_name="学生一号",
            role="student",
            created_by=None,
        )
        second_student = self.repository.create_user(
            username="student-two",
            password_hash="scrypt$test",
            display_name="学生二号",
            role="student",
            created_by=None,
        )

        self.repository.create_wrong_question(
            user_id=first_student["id"],
            subject="数学",
            question_text="求 x 的值。",
            knowledge_points=["一元一次方程"],
        )

        first_records = self.repository.list_wrong_questions(first_student["id"])
        self.assertEqual(first_records[0]["question_text"], "求 x 的值。")
        self.assertEqual(first_records[0]["knowledge_points"], ["一元一次方程"])
        self.assertEqual(self.repository.list_wrong_questions(second_student["id"]), [])


if __name__ == "__main__":
    unittest.main()
