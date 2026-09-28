from pathlib import Path
import unittest

from app.core.config import Settings


class SettingsPathTests(unittest.TestCase):
    def test_relative_student_workspace_database_path_is_resolved_from_backend_directory(self) -> None:
        settings = Settings(student_workspace_database_path="./data/test-workspace.db")
        backend_directory = Path(__file__).resolve().parents[1]

        self.assertEqual(
            settings.student_workspace_database_file,
            backend_directory / "data" / "test-workspace.db",
        )

    def test_only_production_requires_a_first_admin_setup_code(self) -> None:
        self.assertFalse(Settings(app_env="development").requires_bootstrap_setup_code)
        self.assertFalse(Settings(app_env="test").requires_bootstrap_setup_code)
        self.assertTrue(Settings(app_env="production").requires_bootstrap_setup_code)


if __name__ == "__main__":
    unittest.main()
