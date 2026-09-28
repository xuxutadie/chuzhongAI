import unittest

from pydantic import ValidationError

from app.schemas.learning import CompleteTaskRequest


class LearningSchemaTests(unittest.TestCase):
    def test_complete_task_request_rejects_invalid_mastery_level(self) -> None:
        with self.assertRaises(ValidationError):
            CompleteTaskRequest(duration_minutes=20, mastery_level=6)

    def test_complete_task_request_rejects_negative_duration(self) -> None:
        with self.assertRaises(ValidationError):
            CompleteTaskRequest(duration_minutes=-1, mastery_level=3)

    def test_complete_task_request_accepts_optional_feedback(self) -> None:
        request = CompleteTaskRequest(duration_minutes=20, mastery_level=3)

        self.assertIsNone(request.student_feedback)


if __name__ == "__main__":
    unittest.main()
