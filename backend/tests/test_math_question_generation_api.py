import unittest

from fastapi.testclient import TestClient

from app.main import app


class LegacyModelTestRoutesTests(unittest.TestCase):
    """旧浏览器模型测试入口必须从 API 文档和路由表中彻底移除。"""

    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_legacy_model_test_routes_are_not_mounted(self) -> None:
        for path in (
            "/api/v1/admin/model-connection-test",
            "/api/v1/admin/assistant-test",
            "/api/v1/admin/math-question-generation-test",
        ):
            response = self.client.post(path, json={})
            self.assertEqual(response.status_code, 404, path)

    def test_legacy_model_test_routes_are_absent_from_openapi(self) -> None:
        paths = self.client.get("/openapi.json").json()["paths"]
        self.assertNotIn("/api/v1/admin/model-connection-test", paths)
        self.assertNotIn("/api/v1/admin/assistant-test", paths)
        self.assertNotIn("/api/v1/admin/math-question-generation-test", paths)


if __name__ == "__main__":
    unittest.main()
