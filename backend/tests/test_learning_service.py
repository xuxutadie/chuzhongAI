import unittest
from datetime import datetime, timezone

from app.services.learning_service import LearningConflictError, LearningService


STUDENT_ID = "00000000-0000-0000-0000-000000000001"
TASK_ID = "00000000-0000-0000-0000-000000000011"
RECORD_ID = "00000000-0000-0000-0000-000000000021"
GROWTH_ID = "00000000-0000-0000-0000-000000000031"
NOW = datetime(2026, 8, 6, 9, 0, tzinfo=timezone.utc)


class FakeLearningRepository:
    """以内存状态代替 PostgreSQL，验证服务层的学习闭环规则。"""

    def __init__(self, task_status: str = "pending") -> None:
        self.task = {
            "id": TASK_ID,
            "student_id": STUDENT_ID,
            "subject": "math",
            "status": task_status,
            "title": "计算与函数训练",
            "description": "完成基础训练并记录错因",
            "due_date": None,
            "created_at": NOW,
            "updated_at": NOW,
        }
        self.study_record: dict[str, object] | None = None
        self.growth_records: list[dict[str, object]] = []

    def get_task(self, student_id: str, task_id: str) -> dict[str, object] | None:
        if student_id != self.task["student_id"] or task_id != self.task["id"]:
            return None
        return self.task.copy()

    def get_completed_result(self, task_id: str) -> dict[str, object] | None:
        if self.study_record and self.study_record["task_id"] == task_id and self.study_record["status"] == "completed":
            return {
                "task": self.task.copy(),
                "study_record": self.study_record.copy(),
                "growth_record": self.growth_records[0].copy(),
            }
        return None

    def start_task(self, task: dict[str, object]) -> dict[str, object]:
        self.task["status"] = "in_progress"
        self.study_record = {
            "id": RECORD_ID,
            "task_id": task["id"],
            "student_id": task["student_id"],
            "subject": task["subject"],
            "status": "in_progress",
            "started_at": NOW,
            "completed_at": None,
            "duration_minutes": None,
            "mastery_level": None,
            "student_feedback": None,
            "created_at": NOW,
            "updated_at": NOW,
        }
        return self.study_record.copy()

    def complete_task(
        self,
        task: dict[str, object],
        duration_minutes: int,
        mastery_level: int,
        student_feedback: str | None,
        growth_delta: int,
    ) -> dict[str, object]:
        self.task["status"] = "completed"
        self.study_record = {
            "id": RECORD_ID,
            "task_id": task["id"],
            "student_id": task["student_id"],
            "subject": task["subject"],
            "status": "completed",
            "duration_minutes": duration_minutes,
            "mastery_level": mastery_level,
            "student_feedback": student_feedback,
            "started_at": NOW,
            "completed_at": NOW,
            "created_at": NOW,
            "updated_at": NOW,
        }
        growth_record = {
            "id": GROWTH_ID,
            "student_id": task["student_id"],
            "source_type": "task_completion",
            "source_id": task["id"],
            "delta": growth_delta,
            "reason": "完成学习任务",
            "created_at": NOW,
        }
        self.growth_records = [growth_record]
        return {
            "task": self.task.copy(),
            "study_record": self.study_record.copy(),
            "growth_record": growth_record.copy(),
        }

    def list_study_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        if student_id != STUDENT_ID or self.study_record is None:
            return []
        return [self.study_record.copy()][:limit]

    def list_growth_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        if student_id != STUDENT_ID:
            return []
        return [record.copy() for record in self.growth_records[:limit]]


class LearningServiceTests(unittest.TestCase):
    def test_start_pending_task_creates_in_progress_record(self) -> None:
        repository = FakeLearningRepository()
        service = LearningService(repository)

        result = service.start_task(STUDENT_ID, TASK_ID)

        self.assertEqual(result["status"], "in_progress")
        self.assertEqual(repository.task["status"], "in_progress")

    def test_complete_task_records_learning_and_awards_growth_once(self) -> None:
        repository = FakeLearningRepository(task_status="in_progress")
        service = LearningService(repository)

        first_result = service.complete_task(
            student_id=STUDENT_ID,
            task_id=TASK_ID,
            duration_minutes=25,
            mastery_level=4,
            student_feedback="能独立完成",
        )
        second_result = service.complete_task(
            student_id=STUDENT_ID,
            task_id=TASK_ID,
            duration_minutes=25,
            mastery_level=4,
            student_feedback="能独立完成",
        )

        self.assertEqual(first_result["growth_record"]["delta"], 10)
        self.assertEqual(first_result, second_result)
        self.assertEqual(len(repository.growth_records), 1)

    def test_cancelled_task_cannot_start_or_complete(self) -> None:
        repository = FakeLearningRepository(task_status="cancelled")
        service = LearningService(repository)

        with self.assertRaises(LearningConflictError):
            service.start_task(STUDENT_ID, TASK_ID)
        with self.assertRaises(LearningConflictError):
            service.complete_task(STUDENT_ID, TASK_ID, 25, 4, None)


if __name__ == "__main__":
    unittest.main()
