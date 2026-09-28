from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass
from typing import Callable

from app.schemas.model_test import ModelConnectionTestRequest


@dataclass(frozen=True)
class ModelTestSession:
    """仅驻留在本机内存中的模型测试配置。"""

    provider: str
    api_key: str
    model_name: str
    api_base_url: str | None


@dataclass(frozen=True)
class StoredModelTestSession:
    session: ModelTestSession
    expires_at: float


class ModelTestSessionStore:
    """保存短时测试会话；进程结束或 30 分钟后自动失效。"""

    def __init__(self, ttl_seconds: int = 30 * 60, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._sessions: dict[str, StoredModelTestSession] = {}
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()

    def create(self, payload: ModelConnectionTestRequest) -> str:
        session_id = secrets.token_urlsafe(32)
        session = ModelTestSession(
            provider=payload.provider,
            api_key=payload.api_key,
            model_name=payload.model_name,
            api_base_url=payload.api_base_url,
        )
        with self._lock:
            self._remove_expired_sessions()
            self._sessions[session_id] = StoredModelTestSession(
                session=session,
                expires_at=self._clock() + self._ttl_seconds,
            )
        return session_id

    def get(self, session_id: str) -> ModelTestSession | None:
        with self._lock:
            self._remove_expired_sessions()
            stored_session = self._sessions.get(session_id)
            return stored_session.session if stored_session else None

    def _remove_expired_sessions(self) -> None:
        now = self._clock()
        expired_session_ids = [
            session_id
            for session_id, stored_session in self._sessions.items()
            if stored_session.expires_at <= now
        ]
        for session_id in expired_session_ids:
            self._sessions.pop(session_id, None)
