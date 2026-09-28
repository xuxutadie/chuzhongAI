import unittest

from app.schemas.model_test import ModelConnectionTestRequest
from app.services.model_test_session_store import ModelTestSessionStore


class ModelTestSessionStoreTests(unittest.TestCase):
    def test_keeps_the_connection_configuration_until_expiration(self) -> None:
        current_time = 100.0

        def clock() -> float:
            return current_time

        store = ModelTestSessionStore(ttl_seconds=30, clock=clock)
        session_id = store.create(
            ModelConnectionTestRequest(provider="豆包", api_key="ark-test-key", model_name="ep-test-model")
        )

        session = store.get(session_id)

        self.assertIsNotNone(session)
        self.assertEqual(session.model_name, "ep-test-model")

    def test_removes_expired_session(self) -> None:
        current_time = 100.0

        def clock() -> float:
            return current_time

        store = ModelTestSessionStore(ttl_seconds=30, clock=clock)
        session_id = store.create(
            ModelConnectionTestRequest(provider="豆包", api_key="ark-test-key", model_name="ep-test-model")
        )
        current_time = 130.0

        self.assertIsNone(store.get(session_id))
