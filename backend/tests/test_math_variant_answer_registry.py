"""数学 AI 变式题答案的服务端可信登记测试。"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceError, StudentWorkspaceService


class MathVariantAnswerRegistryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.repository = StudentWorkspaceRepository(
            Path(self.temporary_directory.name) / "student-workspace.db"
        )
        self.service = StudentWorkspaceService(self.repository, session_ttl_hours=12)
        admin = self.service.bootstrap_admin(
            username="teacher-admin",
            password="safe-password-123",
            display_name="王老师",
        )["user"]
        self.student = self.service.create_student(
            teacher=admin,
            username="student-one",
            password="safe-password-123",
            display_name="学生一号",
            grade="初一",
        )
        self.second_student = self.service.create_student(
            teacher=admin,
            username="student-two",
            password="safe-password-123",
            display_name="学生二号",
            grade="初一",
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_registered_variant_answer_can_complete_math_task_but_unknown_ai_id_cannot(self) -> None:
        self.service._ensure_today_tasks(self.student["id"], self.service._today())
        self.repository.start_daily_task(
            user_id=self.student["id"],
            task_date=self.service._today(),
            task_id="math-shapes-diagnosis",
        )
        attempts = [
            {"question_id": f"solid-0{index}", "answer": answer}
            for index, answer in enumerate(["a", "b", "true", ["a", "b", "d"], "c", "true", ["a", "b"], "a"], start=1)
        ]
        attempts.extend(
            [
                {
                    "question_id": "solid-09",
                    "answer": {"challengeId": "solid-cube-parts", "passed": True},
                },
                {"question_id": "ai-solid-registered", "answer": "b"},
            ]
        )

        with self.assertRaises(StudentWorkspaceError):
            self.service.complete_today_task(
                user=self.student,
                task_id="math-shapes-diagnosis",
                reflection="我完成了图形结构诊断并复盘自己的答案。",
                evidence={"kind": "math_diagnosis", "attempts": attempts},
            )

        self.service.register_math_variant_answer(
            user=self.student,
            question_id="ai-solid-registered",
            correct_answer="b",
        )
        completed = self.service.complete_today_task(
            user=self.student,
            task_id="math-shapes-diagnosis",
            reflection="我完成了图形结构诊断并复盘自己的答案。",
            evidence={"kind": "math_diagnosis", "attempts": attempts},
        )

        self.assertEqual(completed["task"]["status"], "completed")

    def test_registered_variant_answer_cannot_be_reused_by_another_student(self) -> None:
        self.service.register_math_variant_answer(
            user=self.student,
            question_id="ai-solid-private",
            correct_answer="b",
        )
        self.service._ensure_today_tasks(self.second_student["id"], self.service._today())
        self.repository.start_daily_task(
            user_id=self.second_student["id"],
            task_date=self.service._today(),
            task_id="math-shapes-diagnosis",
        )
        attempts = [
            {"question_id": f"solid-0{index}", "answer": answer}
            for index, answer in enumerate(["a", "b", "true", ["a", "b", "d"], "c", "true", ["a", "b"], "a"], start=1)
        ]
        attempts.extend(
            [
                {
                    "question_id": "solid-09",
                    "answer": {"challengeId": "solid-cube-parts", "passed": True},
                },
                {"question_id": "ai-solid-private", "answer": "b"},
            ]
        )

        with self.assertRaises(StudentWorkspaceError):
            self.service.complete_today_task(
                user=self.second_student,
                task_id="math-shapes-diagnosis",
                reflection="我完成了图形结构诊断并复盘自己的答案。",
                evidence={"kind": "math_diagnosis", "attempts": attempts},
            )


if __name__ == "__main__":
    unittest.main()
