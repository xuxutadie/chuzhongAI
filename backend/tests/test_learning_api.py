import unittest

from fastapi.testclient import TestClient

from app.main import app
from tests.test_learning_service import STUDENT_ID, TASK_ID


class LegacyLearningApiIsolationTests(unittest.TestCase):
    """旧 PostgreSQL 服务仍有单元测试，但不能再以学生 ID 公开访问。"""

    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_student_id_task_route_is_not_public(self) -> None:
        response = self.client.post(
            f"/api/v1/students/{STUDENT_ID}/tasks/{TASK_ID}/complete",
            json={
                "duration_minutes": 25,
                "mastery_level": 4,
                "student_feedback": "能独立完成",
            },
        )

        self.assertEqual(response.status_code, 404)

    def test_student_id_records_routes_are_not_public(self) -> None:
        study_response = self.client.get(
            f"/api/v1/students/{STUDENT_ID}/study-records?limit=1"
        )
        growth_response = self.client.get(
            f"/api/v1/students/{STUDENT_ID}/growth-records?limit=1"
        )

        self.assertEqual(study_response.status_code, 404)
        self.assertEqual(growth_response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
