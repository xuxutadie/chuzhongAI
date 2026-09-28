from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from app.services.learning_service import LearningConflictError


ConnectionFactory = Callable[[], AbstractContextManager[Any]]


class PostgresLearningRepository:
    """基于 PostgreSQL 的学习任务、记录和成长值仓储。"""

    def __init__(
        self,
        database_url: str,
        connection_factory: ConnectionFactory | None = None,
    ) -> None:
        self.database_url = database_url
        self._connection_factory = connection_factory or self._create_connection

    def get_task(self, student_id: str, task_id: str) -> dict[str, object] | None:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM learning_task WHERE id = %s AND student_id = %s",
                    (task_id, student_id),
                )
                return cursor.fetchone()

    def get_completed_result(self, task_id: str) -> dict[str, object] | None:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                return self._get_completed_result_with_cursor(cursor, task_id)

    def start_task(self, task: dict[str, object]) -> dict[str, object]:
        student_id = str(task["student_id"])
        task_id = str(task["id"])
        with self._connection_factory() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    locked_task = self._lock_task(cursor, student_id, task_id)
                    self._ensure_startable(locked_task)
                    cursor.execute(
                        """
                        UPDATE learning_task
                        SET status = 'in_progress', updated_at = now()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (task_id,),
                    )
                    cursor.execute(
                        """
                        INSERT INTO study_record (
                            student_id, task_id, subject, status
                        )
                        VALUES (%s, %s, %s, 'in_progress')
                        ON CONFLICT (task_id) DO UPDATE
                        SET updated_at = now()
                        WHERE study_record.status = 'in_progress'
                        RETURNING *
                        """,
                        (student_id, task_id, locked_task["subject"]),
                    )
                    record = cursor.fetchone()
                    if record is not None:
                        return record
                    raise LearningConflictError("当前任务已有已完成学习记录")

    def complete_task(
        self,
        task: dict[str, object],
        duration_minutes: int,
        mastery_level: int,
        student_feedback: str | None,
        growth_delta: int,
    ) -> dict[str, object]:
        student_id = str(task["student_id"])
        task_id = str(task["id"])
        with self._connection_factory() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    locked_task = self._lock_task(cursor, student_id, task_id)
                    if locked_task["status"] == "cancelled":
                        raise LearningConflictError("已取消任务不能执行")
                    completed_result = self._get_completed_result_with_cursor(cursor, task_id)
                    if completed_result is not None:
                        return completed_result
                    if locked_task["status"] not in {"pending", "in_progress"}:
                        raise LearningConflictError("当前任务状态不能标记完成")

                    cursor.execute(
                        """
                        INSERT INTO study_record (
                            student_id, task_id, subject, status, completed_at,
                            duration_minutes, mastery_level, student_feedback
                        )
                        VALUES (%s, %s, %s, 'completed', now(), %s, %s, %s)
                        ON CONFLICT (task_id) DO UPDATE
                        SET status = 'completed',
                            completed_at = EXCLUDED.completed_at,
                            duration_minutes = EXCLUDED.duration_minutes,
                            mastery_level = EXCLUDED.mastery_level,
                            student_feedback = EXCLUDED.student_feedback,
                            updated_at = now()
                        RETURNING *
                        """,
                        (
                            student_id,
                            task_id,
                            locked_task["subject"],
                            duration_minutes,
                            mastery_level,
                            student_feedback,
                        ),
                    )
                    study_record = cursor.fetchone()
                    cursor.execute(
                        """
                        UPDATE learning_task
                        SET status = 'completed', updated_at = now()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (task_id,),
                    )
                    completed_task = cursor.fetchone()
                    cursor.execute(
                        """
                        INSERT INTO growth_record (
                            student_id, source_type, source_id, delta, reason
                        )
                        VALUES (%s, 'task_completion', %s, %s, '完成学习任务')
                        ON CONFLICT (student_id, source_type, source_id) DO UPDATE
                        SET reason = growth_record.reason
                        RETURNING *
                        """,
                        (student_id, task_id, growth_delta),
                    )
                    growth_record = cursor.fetchone()
                    return {
                        "task": completed_task,
                        "study_record": study_record,
                        "growth_record": growth_record,
                    }

    def list_study_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT * FROM study_record
                    WHERE student_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (student_id, limit),
                )
                return cursor.fetchall()

    def list_growth_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        with self._connection_factory() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT * FROM growth_record
                    WHERE student_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (student_id, limit),
                )
                return cursor.fetchall()

    def _create_connection(self) -> Any:
        return psycopg.connect(self.database_url, row_factory=dict_row)

    @staticmethod
    def _lock_task(cursor: Any, student_id: str, task_id: str) -> dict[str, object]:
        cursor.execute(
            """
            SELECT * FROM learning_task
            WHERE id = %s AND student_id = %s
            FOR UPDATE
            """,
            (task_id, student_id),
        )
        task = cursor.fetchone()
        if task is None:
            raise LearningConflictError("学习任务不存在或不属于当前学生")
        return task

    @staticmethod
    def _ensure_startable(task: dict[str, object]) -> None:
        if task["status"] == "cancelled":
            raise LearningConflictError("已取消任务不能执行")
        if task["status"] == "completed":
            raise LearningConflictError("已完成任务不能再次开始")

    @staticmethod
    def _get_completed_result_with_cursor(cursor: Any, task_id: str) -> dict[str, object] | None:
        cursor.execute(
            "SELECT * FROM study_record WHERE task_id = %s AND status = 'completed'",
            (task_id,),
        )
        study_record = cursor.fetchone()
        if study_record is None:
            return None
        cursor.execute("SELECT * FROM learning_task WHERE id = %s", (task_id,))
        task = cursor.fetchone()
        cursor.execute(
            """
            SELECT * FROM growth_record
            WHERE student_id = %s AND source_type = 'task_completion' AND source_id = %s
            """,
            (study_record["student_id"], task_id),
        )
        growth_record = cursor.fetchone()
        if task is None or growth_record is None:
            raise LearningConflictError("已完成任务缺少完整学习闭环记录")
        return {
            "task": task,
            "study_record": study_record,
            "growth_record": growth_record,
        }
