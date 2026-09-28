import unittest

from app.repositories.learning_repository import PostgresLearningRepository


class LearningRepositoryTests(unittest.TestCase):
    def test_repository_keeps_configured_database_url(self) -> None:
        database_url = "postgresql://postgres:postgres@localhost:5432/ai_middle_school_coach"

        repository = PostgresLearningRepository(database_url)

        self.assertEqual(repository.database_url, database_url)


if __name__ == "__main__":
    unittest.main()
