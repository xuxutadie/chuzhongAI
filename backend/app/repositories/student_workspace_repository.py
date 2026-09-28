"""学生账户与学习工作台的 SQLite 持久化仓储。

这个仓储与既有的 PostgreSQL 学习记录仓储并存，避免为了新增学生端能力
而影响已经存在的旧接口。每次操作使用短连接，适合当前本机/校内小规模部署。
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from app.admin_workspace.schema import initialize_account_state, account_is_active


class DuplicateUsernameError(Exception):
    """用户名已被占用。"""


class DailyTaskNotStartedError(Exception):
    """每日任务尚未进入学习状态。"""


class WrongQuestionUploadNotFoundError(Exception):
    """当前学生没有这张暂存图片。"""


class WrongQuestionUploadAlreadyAttachedError(Exception):
    """暂存图片已被确认到另一条错题。"""


class StudentWorkspaceRepository:
    """保存学生账号、会话、工作台和每日任务的 SQLite 仓储。"""

    def __init__(self, database_path: str | Path) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(
            self.database_path,
            timeout=5,
            isolation_level="DEFERRED",
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize_database(self) -> None:
        with self._connection() as connection:
            # WAL 能降低读写相互阻塞的概率，外键约束防止孤立的学生数据。
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    password_hash TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('admin', 'student', 'parent', 'coach', 'teacher')),
                    grade TEXT,
                    auth_version INTEGER NOT NULL DEFAULT 1,
                    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL UNIQUE,
                    auth_version INTEGER NOT NULL DEFAULT 1,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
                CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

                CREATE TABLE IF NOT EXISTS workspace_states (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    state_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL
                );

                /* 学生当前选择的已导入课程，只保存服务端目录中的稳定 ID。 */
                CREATE TABLE IF NOT EXISTS student_course_context (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    course_id TEXT NOT NULL,
                    chapter_id TEXT NOT NULL,
                    knowledge_point_ids_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS daily_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    task_date TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    title TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    learning_href TEXT NOT NULL,
                    growth_earned INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'not_started'
                        CHECK(status IN ('not_started', 'in_progress', 'completed')),
                    started_at TEXT,
                    completed_at TEXT,
                    reflection TEXT,
                    course_context_json TEXT,
                    UNIQUE(user_id, task_date, task_id)
                );
                CREATE INDEX IF NOT EXISTS idx_daily_tasks_owner_date
                    ON daily_tasks(user_id, task_date);

                /* 为后续 OCR/错题流程预建归属边界，接口在下一阶段接入。 */
                CREATE TABLE IF NOT EXISTS wrong_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    subject TEXT NOT NULL,
                    question_text TEXT NOT NULL,
                    knowledge_points_json TEXT NOT NULL DEFAULT '[]',
                    error_reason TEXT,
                    source_image BLOB,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_wrong_questions_owner
                    ON wrong_questions(user_id, created_at DESC);

                /* 原始图片先暂存，学生确认题干后才绑定到错题记录。 */
                CREATE TABLE IF NOT EXISTS wrong_question_uploads (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    media_type TEXT NOT NULL,
                    image_data BLOB NOT NULL,
                    byte_size INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'staged'
                        CHECK(status IN ('staged', 'attached')),
                    ocr_result_json TEXT,
                    ocr_recognized_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_wrong_question_uploads_owner
                    ON wrong_question_uploads(user_id, created_at DESC);

                /* AI 变式题的答案只保存在服务端，并按学生隔离。 */
                CREATE TABLE IF NOT EXISTS math_variant_answers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    question_id TEXT NOT NULL,
                    correct_answer_json TEXT NOT NULL,
                    knowledge_point_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id, question_id)
                );
                CREATE INDEX IF NOT EXISTS idx_math_variant_answers_owner_question
                    ON math_variant_answers(user_id, question_id);
                """
            )
            # 兼容早期已创建的本机数据库：为密码重置后的会话失效补充版本字段。
            self._ensure_column(connection, "users", "auth_version", "INTEGER NOT NULL DEFAULT 1")
            self._ensure_column(connection, "sessions", "auth_version", "INTEGER NOT NULL DEFAULT 1")
            self._ensure_column(connection, "wrong_questions", "source_upload_id", "TEXT")
            self._ensure_column(
                connection,
                "wrong_questions",
                "analysis_status",
                "TEXT NOT NULL DEFAULT 'not_requested'",
            )
            self._ensure_column(connection, "wrong_questions", "analysis_summary", "TEXT")
            self._ensure_column(connection, "wrong_question_uploads", "expires_at", "TEXT")
            self._ensure_column(connection, "daily_tasks", "course_context_json", "TEXT")
            self._ensure_column(connection, "math_variant_answers", "knowledge_point_id", "TEXT")
            self._backfill_staged_upload_expiries(connection)
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_wrong_question_uploads_staged_expiry
                ON wrong_question_uploads(status, expires_at)
                """
            )

    def has_admin(self) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"
            ).fetchone()
        return row is not None

    def create_first_admin(
        self,
        *,
        username: str,
        password_hash: str,
        display_name: str,
    ) -> dict[str, Any] | None:
        """原子地创建首个管理员；已有管理员时返回 ``None``。"""

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT 1 FROM users WHERE role = 'admin' LIMIT 1"
            ).fetchone()
            if existing is not None:
                return None
            try:
                cursor = connection.execute(
                    """
                    INSERT INTO users (
                        username, password_hash, display_name, role, grade, created_by, created_at
                    ) VALUES (?, ?, ?, 'admin', NULL, NULL, ?)
                    """,
                    (username, password_hash, display_name, self._now()),
                )
            except sqlite3.IntegrityError as error:
                raise DuplicateUsernameError("该用户名已被使用") from error
            initialize_account_state(connection, int(cursor.lastrowid))
            return self._get_user_by_id_with_connection(connection, int(cursor.lastrowid))

    def create_user(
        self,
        *,
        username: str,
        password_hash: str,
        display_name: str,
        role: str,
        created_by: int | None,
        grade: str | None = None,
    ) -> dict[str, Any]:
        with self._connection() as connection:
            try:
                cursor = connection.execute(
                    """
                    INSERT INTO users (
                        username, password_hash, display_name, role, grade, created_by, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (username, password_hash, display_name, role, grade, created_by, self._now()),
                )
            except sqlite3.IntegrityError as error:
                raise DuplicateUsernameError("该用户名已被使用") from error
            if role == 'student' and created_by is not None:
                self._link_created_student(connection, created_by, int(cursor.lastrowid))
            initialize_account_state(connection, int(cursor.lastrowid))
            return self._get_user_by_id_with_connection(connection, int(cursor.lastrowid))

    def create_students_batch(
        self,
        *,
        created_by: int,
        students: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """用单个事务保存教师的整批学生，异常时由连接上下文全部回滚。"""

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            created: list[dict[str, Any]] = []
            for student in students:
                try:
                    cursor = connection.execute(
                        """
                        INSERT INTO users (
                            username, password_hash, display_name, role, grade, created_by, created_at
                        ) VALUES (?, ?, ?, 'student', ?, ?, ?)
                        """,
                        (student["username"], student["password_hash"], student["display_name"],
                         student.get("grade"), created_by, self._now()),
                    )
                except sqlite3.IntegrityError as error:
                    raise DuplicateUsernameError("本批次中有用户名已被使用") from error
                self._link_created_student(connection, created_by, int(cursor.lastrowid))
                initialize_account_state(connection, int(cursor.lastrowid))
                created.append(self._get_user_by_id_with_connection(connection, int(cursor.lastrowid)))
            return created

    def _link_created_student(self, connection, admin_id, student_id):
        # 仅已完成显式教师迁移的库建立学情关联，不在创建请求中建表。
        if connection.execute("SELECT 1 FROM sqlite_master WHERE name='teacher_schema_versions'").fetchone():
            connection.execute("""INSERT INTO teacher_student_links(teacher_id,student_id,source,status,linked_at)
                SELECT id,?,'legacy_created','active',? FROM users WHERE id=? AND role='admin'""",
                (student_id,self._now(),admin_id))

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()
        return self._row_to_dict(row)

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        with self._connection() as connection:
            return self._get_user_by_id_with_connection(connection, user_id)

    def account_is_active(self, user_id: int) -> bool:
        with self._connection() as connection:
            return account_is_active(connection, user_id)

    def list_students(self, created_by: int) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM users
                WHERE role = 'student' AND created_by = ?
                ORDER BY created_at ASC, id ASC
                """,
                (created_by,),
            ).fetchall()
        return [dict(row) for row in rows]

    def reset_owned_student_password(
        self,
        *,
        teacher_id: int,
        student_id: int,
        password_hash: str,
    ) -> bool:
        """重置本教师创建的学生密码，并同时撤销该学生全部已登录会话。"""

        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE users
                SET password_hash = ?, auth_version = auth_version + 1
                WHERE id = ? AND role = 'student' AND created_by = ?
                """,
                (password_hash, student_id, teacher_id),
            )
            if cursor.rowcount != 1:
                return False
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (student_id,))
        return True

    def create_session(
        self,
        *,
        user_id: int,
        token_hash: str,
        expires_at: str,
        auth_version: int = 1,
    ) -> dict[str, Any]:
        with self._connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO sessions (user_id, token_hash, auth_version, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, token_hash, auth_version, expires_at, self._now()),
            )
            row = connection.execute(
                "SELECT * FROM sessions WHERE id = ?",
                (int(cursor.lastrowid),),
            ).fetchone()
        return dict(row)

    def get_session_user(self, token_hash: str, now: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            row = connection.execute(
                """
                SELECT users.* FROM sessions
                INNER JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ?
                    AND sessions.expires_at > ?
                    AND sessions.auth_version = users.auth_version
                """,
                (token_hash, now),
            ).fetchone()
            if row is not None and not account_is_active(connection, row['id']):
                return None
        return self._row_to_dict(row)

    def delete_session(self, token_hash: str) -> bool:
        with self._connection() as connection:
            cursor = connection.execute(
                "DELETE FROM sessions WHERE token_hash = ?",
                (token_hash,),
            )
        return cursor.rowcount > 0

    def save_workspace_state(self, user_id: int, state: dict[str, Any]) -> dict[str, Any]:
        serialized_state = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        now = self._now()
        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO workspace_states (user_id, state_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    updated_at = excluded.updated_at
                """,
                (user_id, serialized_state, now),
            )
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='question_answer_events'").fetchone():
                from app.services.wrong_question_collection import WrongQuestionCollection
                WrongQuestionCollection(None).collect_workspace_answers(connection,user_id,state)
        return {"state": state, "updated_at": now}

    def get_workspace_state(self, user_id: int) -> dict[str, Any]:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT state_json FROM workspace_states WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            return {}
        try:
            state = json.loads(str(row["state_json"]))
        except json.JSONDecodeError:
            return {}
        return state if isinstance(state, dict) else {}

    def get_student_course_context(self, user_id: int) -> dict[str, Any] | None:
        """只读取当前学生自己的课程选择 ID，不信任或返回客户端传入的展示文本。"""

        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT course_id, chapter_id, knowledge_point_ids_json, updated_at
                FROM student_course_context WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        return self._student_course_context_row_to_dict(row)

    def save_student_course_context(
        self,
        *,
        user_id: int,
        course_id: str,
        chapter_id: str,
        knowledge_point_ids: list[str],
    ) -> dict[str, Any]:
        now = self._now()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO student_course_context (
                    user_id, course_id, chapter_id, knowledge_point_ids_json, updated_at
                ) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    course_id = excluded.course_id,
                    chapter_id = excluded.chapter_id,
                    knowledge_point_ids_json = excluded.knowledge_point_ids_json,
                    updated_at = excluded.updated_at
                """,
                (
                    user_id,
                    course_id,
                    chapter_id,
                    json.dumps(knowledge_point_ids, ensure_ascii=False, separators=(",", ":")),
                    now,
                ),
            )
            row = connection.execute(
                """
                SELECT course_id, chapter_id, knowledge_point_ids_json, updated_at
                FROM student_course_context WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        if row is None:
            raise RuntimeError("课程选择保存后未找到记录")
        return self._student_course_context_row_to_dict(row) or {}

    def ensure_daily_tasks(
        self,
        *,
        user_id: int,
        task_date: str,
        tasks: Iterable[dict[str, Any]],
    ) -> None:
        with self._connection() as connection:
            for task in tasks:
                course_context = task.get("course_context")
                course_context_json = (
                    json.dumps(course_context, ensure_ascii=False, separators=(",", ":"))
                    if isinstance(course_context, dict)
                    else None
                )
                connection.execute(
                    """
                    INSERT INTO daily_tasks (
                        user_id, task_date, task_id, subject, title, objective,
                        learning_href, growth_earned, status, course_context_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started', ?)
                    ON CONFLICT(user_id, task_date, task_id) DO UPDATE SET
                        subject = excluded.subject,
                        title = excluded.title,
                        objective = excluded.objective,
                        learning_href = excluded.learning_href,
                        growth_earned = excluded.growth_earned,
                        course_context_json = excluded.course_context_json
                    WHERE daily_tasks.status = 'not_started'
                    """,
                    (
                        user_id,
                        task_date,
                        task["id"],
                        task["subject"],
                        task["title"],
                        task["objective"],
                        task["learning_href"],
                        task["growth_earned"],
                        course_context_json,
                    ),
                )

    def list_daily_tasks(self, user_id: int, task_date: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT * FROM daily_tasks
                WHERE user_id = ? AND task_date = ?
                ORDER BY id ASC
                """,
                (user_id, task_date),
            ).fetchall()
        return [self._daily_task_row_to_dict(row) for row in rows]

    def get_daily_task(
        self,
        *,
        user_id: int,
        task_date: str,
        task_id: str,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT * FROM daily_tasks
                WHERE user_id = ? AND task_date = ? AND task_id = ?
                """,
                (user_id, task_date, task_id),
            ).fetchone()
        return self._daily_task_row_to_dict(row)

    def list_language_unit_history(self, user_id: int) -> list[dict[str, Any]]:
        """每单元返回最近一次学习日期及最近一次完成时间，不向外暴露其他账号记录。"""
        with self._connection() as connection:
            rows = connection.execute(
                """SELECT task_id, MAX(task_date) AS last_studied_date,
                          MAX(completed_at) AS last_completed_at,
                          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_count
                   FROM daily_tasks WHERE user_id = ? AND task_id LIKE 'language-%'
                   GROUP BY task_id""", (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def start_daily_task(
        self,
        *,
        user_id: int,
        task_date: str,
        task_id: str,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            connection.execute(
                """
                UPDATE daily_tasks
                SET status = 'in_progress', started_at = COALESCE(started_at, ?)
                WHERE user_id = ? AND task_date = ? AND task_id = ? AND status = 'not_started'
                """,
                (self._now(), user_id, task_date, task_id),
            )
            row = connection.execute(
                """
                SELECT * FROM daily_tasks
                WHERE user_id = ? AND task_date = ? AND task_id = ?
                """,
                (user_id, task_date, task_id),
            ).fetchone()
        return self._daily_task_row_to_dict(row)

    def complete_daily_task(
        self,
        *,
        user_id: int,
        task_date: str,
        task_id: str,
        reflection: str,
    ) -> tuple[dict[str, Any] | None, bool]:
        """完成任务；第二次提交返回首次记录并标识为幂等重放。"""

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT * FROM daily_tasks
                WHERE user_id = ? AND task_date = ? AND task_id = ?
                """,
                (user_id, task_date, task_id),
            ).fetchone()
            if row is None:
                return None, False
            if row["status"] == "completed":
                return self._daily_task_row_to_dict(row), True
            if row["status"] != "in_progress":
                raise DailyTaskNotStartedError("请先开始任务，再提交完成结果")
            connection.execute(
                """
                UPDATE daily_tasks
                SET status = 'completed', completed_at = ?, reflection = ?
                WHERE id = ?
                """,
                (self._now(), reflection, int(row["id"])),
            )
            completed = connection.execute(
                "SELECT * FROM daily_tasks WHERE id = ?",
                (int(row["id"]),),
            ).fetchone()
        return self._daily_task_row_to_dict(completed), False

    def get_today_growth_earned(self, user_id: int, task_date: str) -> int:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT COALESCE(SUM(growth_earned), 0) AS total
                FROM daily_tasks
                WHERE user_id = ? AND task_date = ? AND status = 'completed'
                """,
                (user_id, task_date),
            ).fetchone()
        return int(row["total"])

    def create_wrong_question(
        self,
        *,
        user_id: int,
        subject: str,
        question_text: str,
        knowledge_points: list[str] | None = None,
        error_reason: str | None = None,
        source_image: bytes | None = None,
        source_upload_id: str | None = None,
    ) -> dict[str, Any]:
        """保存错题并强制归属当前用户；暂存图片只能被同一学生确认一次。"""

        now = self._now()
        with self._connection() as connection:
            if source_upload_id is not None:
                # 先取得写锁，避免两个并发确认请求同时消费同一张暂存图片。
                connection.execute("BEGIN IMMEDIATE")
                upload = connection.execute(
                    """
                    SELECT status, expires_at FROM wrong_question_uploads
                    WHERE id = ? AND user_id = ?
                    """,
                    (source_upload_id, user_id),
                ).fetchone()
                if upload is None:
                    raise WrongQuestionUploadNotFoundError("未找到这张待确认图片")
                if (
                    upload["status"] == "staged"
                    and upload["expires_at"] is not None
                    and str(upload["expires_at"]) <= now
                ):
                    # 防止清理与“确认保存”并发时，已经过期的暂存图被重新绑定。
                    connection.execute(
                        """
                        DELETE FROM wrong_question_uploads
                        WHERE id = ? AND user_id = ? AND status = 'staged' AND expires_at <= ?
                        """,
                        (source_upload_id, user_id, now),
                    )
                    raise WrongQuestionUploadNotFoundError("这张待确认图片已过期，请重新上传")
                if upload["status"] != "staged":
                    raise WrongQuestionUploadAlreadyAttachedError("这张图片已经加入错题集")
            cursor = connection.execute(
                """
                INSERT INTO wrong_questions (
                    user_id, subject, question_text, knowledge_points_json,
                    error_reason, source_image, source_upload_id, analysis_status,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'not_requested', ?, ?)
                """,
                (
                    user_id,
                    subject,
                    question_text,
                    json.dumps(knowledge_points or [], ensure_ascii=False),
                    error_reason,
                    source_image,
                    source_upload_id,
                    now,
                    now,
                ),
            )
            if source_upload_id is not None:
                connection.execute(
                    """
                    UPDATE wrong_question_uploads
                    SET status = 'attached', updated_at = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (now, source_upload_id, user_id),
                )
            row = connection.execute(
                self._wrong_question_select_sql("WHERE id = ?"),
                (int(cursor.lastrowid),),
            ).fetchone()
        return self._wrong_question_row_to_dict(row)

    def list_wrong_questions(
        self,
        user_id: int,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._connection() as connection:
            if limit is None:
                rows = connection.execute(
                    self._wrong_question_select_sql("WHERE user_id = ? ORDER BY created_at DESC, id DESC"),
                    (user_id,),
                ).fetchall()
            else:
                rows = connection.execute(
                    self._wrong_question_select_sql(
                        "WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
                    ),
                    (user_id, limit, offset),
                ).fetchall()
        return [self._wrong_question_row_to_dict(row) for row in rows]

    def count_wrong_questions(self, user_id: int) -> int:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM wrong_questions WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return int(row["total"])

    def get_wrong_question(self, *, user_id: int, question_id: int) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                self._wrong_question_select_sql("WHERE id = ? AND user_id = ?"),
                (question_id, user_id),
            ).fetchone()
        return self._wrong_question_row_to_dict(row) if row is not None else None

    def update_wrong_question(
        self,
        *,
        user_id: int,
        question_id: int,
        subject: str | None = None,
        question_text: str | None = None,
        knowledge_points: list[str] | None = None,
        error_reason: str | None = None,
        clear_error_reason: bool = False,
    ) -> dict[str, Any] | None:
        """仅更新当前学生自己的错题，未传字段保持原样。"""

        assignments: list[str] = []
        values: list[Any] = []
        content_changed = subject is not None or question_text is not None or knowledge_points is not None
        if subject is not None:
            assignments.append("subject = ?")
            values.append(subject)
        if question_text is not None:
            assignments.append("question_text = ?")
            values.append(question_text)
        if knowledge_points is not None:
            assignments.append("knowledge_points_json = ?")
            values.append(json.dumps(knowledge_points, ensure_ascii=False))
        if error_reason is not None or clear_error_reason:
            assignments.append("error_reason = ?")
            values.append(error_reason)
        if content_changed:
            # 题干、学科或知识点变化后，旧 AI 分析不再可信；手动错误原因仍可保留。
            assignments.extend(["analysis_status = 'not_requested'", "analysis_summary = NULL"])
            if error_reason is None and not clear_error_reason:
                assignments.append(
                    "error_reason = CASE WHEN analysis_status = 'completed' THEN NULL ELSE error_reason END"
                )
        if not assignments:
            return self.get_wrong_question(user_id=user_id, question_id=question_id)
        assignments.append("updated_at = ?")
        values.extend([self._now(), question_id, user_id])
        with self._connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            cursor = connection.execute(
                f"UPDATE wrong_questions SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
                values,
            )
            if cursor.rowcount != 1:
                return None
            if content_changed and connection.execute("SELECT 1 FROM sqlite_master WHERE name='wrong_question_learning'").fetchone():
                # 手动改写不再沿用原题标准答案；旧事件不变，新内容等待核实。
                connection.execute("UPDATE wrong_question_learning SET evidence_version=evidence_version+1,revision=revision+1,stage='pending_verification',state_json=?,due_date=NULL,review_passes=0 WHERE user_id=? AND wrong_question_id=?",(json.dumps({'manual_edit':True}),user_id,question_id))
                learning=connection.execute('SELECT id FROM wrong_question_learning WHERE user_id=? AND wrong_question_id=?',(user_id,question_id)).fetchone()
                if learning:
                    connection.execute("UPDATE wrong_question_ai_jobs SET status='stale',result_json=NULL WHERE user_id=? AND learning_id=?",(user_id,learning['id']))
                    connection.execute('UPDATE wrong_question_practice_items SET frozen=1 WHERE user_id=? AND learning_id=?',(user_id,learning['id']))
            row = connection.execute(
                self._wrong_question_select_sql("WHERE id = ? AND user_id = ?"),
                (question_id, user_id),
            ).fetchone()
        return self._wrong_question_row_to_dict(row) if row is not None else None

    def delete_wrong_question(self, *, user_id: int, question_id: int) -> bool:
        """删除错题时一并删除其独占的原始图片，避免遗留学生图片。"""

        with self._connection() as connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute(
                "SELECT source_upload_id FROM wrong_questions WHERE id = ? AND user_id = ?",
                (question_id, user_id),
            ).fetchone()
            if row is None:
                return False
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='wrong_question_learning'").fetchone():
                # 保留不可读的来源抑制标记，历史补收不会把学生明确删除的题恢复。
                from app.services.wrong_question_collection import WrongQuestionCollection
                WrongQuestionCollection(None).suppress(connection,user_id,question_id)
            connection.execute(
                "DELETE FROM wrong_questions WHERE id = ? AND user_id = ?",
                (question_id, user_id),
            )
            if row["source_upload_id"] is not None:
                connection.execute(
                    "DELETE FROM wrong_question_uploads WHERE id = ? AND user_id = ?",
                    (str(row["source_upload_id"]), user_id),
                )
        return True

    def create_wrong_question_upload(
        self,
        *,
        upload_id: str,
        user_id: int,
        media_type: str,
        image_data: bytes,
    ) -> dict[str, Any]:
        """保存临时图片；列表读取永远不选择 ``image_data``。"""

        now = self._now()
        expires_at = self._staged_upload_expiry(now)
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO wrong_question_uploads (
                    id, user_id, media_type, image_data, byte_size, status,
                    created_at, updated_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, 'staged', ?, ?, ?)
                """,
                (upload_id, user_id, media_type, image_data, len(image_data), now, now, expires_at),
            )
            row = connection.execute(
                """
                SELECT id, media_type, byte_size, status, created_at, updated_at
                FROM wrong_question_uploads WHERE id = ? AND user_id = ?
                """,
                (upload_id, user_id),
            ).fetchone()
        return dict(row)

    def delete_expired_staged_wrong_question_uploads(self, *, now: str | None = None) -> int:
        """机会性清理超过 24 小时仍未确认的图片，绝不删除已绑定错题的图片。"""

        cleanup_time = now or self._now()
        with self._connection() as connection:
            cursor = connection.execute(
                """
                DELETE FROM wrong_question_uploads
                WHERE status = 'staged' AND expires_at IS NOT NULL AND expires_at <= ?
                """,
                (cleanup_time,),
            )
        return max(0, cursor.rowcount)

    def get_wrong_question_upload_metadata(
        self,
        *,
        user_id: int,
        upload_id: str,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT id, media_type, byte_size, status, ocr_result_json,
                       ocr_recognized_at, created_at, updated_at
                FROM wrong_question_uploads WHERE id = ? AND user_id = ?
                """,
                (upload_id, user_id),
            ).fetchone()
        return self._upload_metadata_row_to_dict(row)

    def get_wrong_question_upload_image(
        self,
        *,
        user_id: int,
        upload_id: str,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT media_type, image_data, byte_size
                FROM wrong_question_uploads WHERE id = ? AND user_id = ?
                """,
                (upload_id, user_id),
            ).fetchone()
        return dict(row) if row is not None else None

    def delete_staged_wrong_question_upload(self, *, user_id: int, upload_id: str) -> str:
        """仅删除尚未确认的图片，返回 deleted、attached 或 not_found。"""

        with self._connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT status FROM wrong_question_uploads WHERE id = ? AND user_id = ?",
                (upload_id, user_id),
            ).fetchone()
            if row is None:
                return "not_found"
            if row["status"] != "staged":
                return "attached"
            connection.execute(
                "DELETE FROM wrong_question_uploads WHERE id = ? AND user_id = ? AND status = 'staged'",
                (upload_id, user_id),
            )
        return "deleted"

    def save_wrong_question_upload_ocr_result(
        self,
        *,
        user_id: int,
        upload_id: str,
        result: dict[str, Any],
    ) -> bool:
        now = self._now()
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE wrong_question_uploads
                SET ocr_result_json = ?, ocr_recognized_at = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (json.dumps(result, ensure_ascii=False), now, now, upload_id, user_id),
            )
        return cursor.rowcount == 1

    def get_wrong_question_image(
        self,
        *,
        user_id: int,
        question_id: int,
    ) -> dict[str, Any] | None:
        """显式图片读取入口；错题列表查询永远不会包含 BLOB。"""

        with self._connection() as connection:
            question = connection.execute(
                """
                SELECT source_upload_id, source_image
                FROM wrong_questions WHERE id = ? AND user_id = ?
                """,
                (question_id, user_id),
            ).fetchone()
            if question is None:
                return None
            if question["source_upload_id"] is not None:
                upload = connection.execute(
                    """
                    SELECT media_type, image_data FROM wrong_question_uploads
                    WHERE id = ? AND user_id = ?
                    """,
                    (str(question["source_upload_id"]), user_id),
                ).fetchone()
                return dict(upload) if upload is not None else None
            if question["source_image"] is not None:
                # 早期记录没有 MIME 字段，按最常见的 JPEG 兼容读取。
                return {"media_type": "image/jpeg", "image_data": bytes(question["source_image"])}
        return None

    def save_wrong_question_analysis(
        self,
        *,
        user_id: int,
        question_id: int,
        error_reason: str,
        knowledge_points: list[str],
        suggestion: str,
    ) -> dict[str, Any] | None:
        now = self._now()
        with self._connection() as connection:
            cursor = connection.execute(
                """
                UPDATE wrong_questions
                SET error_reason = ?, knowledge_points_json = ?, analysis_summary = ?,
                    analysis_status = 'completed', updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (
                    error_reason,
                    json.dumps(knowledge_points, ensure_ascii=False),
                    suggestion,
                    now,
                    question_id,
                    user_id,
                ),
            )
            if cursor.rowcount != 1:
                return None
            row = connection.execute(
                self._wrong_question_select_sql("WHERE id = ? AND user_id = ?"),
                (question_id, user_id),
            ).fetchone()
        return self._wrong_question_row_to_dict(row) if row is not None else None

    def register_math_variant_answer(
        self,
        *,
        user_id: int,
        question_id: str,
        correct_answer: Any,
        knowledge_point_id: str | None = None,
    ) -> None:
        now = self._now()
        serialized_answer = json.dumps(correct_answer, ensure_ascii=False, separators=(",", ":"))
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO math_variant_answers (
                    user_id, question_id, correct_answer_json, knowledge_point_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, question_id) DO UPDATE SET
                    correct_answer_json = excluded.correct_answer_json,
                    knowledge_point_id = excluded.knowledge_point_id,
                    updated_at = excluded.updated_at
                """,
                (user_id, question_id, serialized_answer, knowledge_point_id, now, now),
            )

    def get_math_variant_answer(self, *, user_id: int, question_id: str) -> Any | None:
        record = self.get_math_variant_answer_record(user_id=user_id, question_id=question_id)
        return record.get("correct_answer") if record is not None else None

    def get_math_variant_answer_record(
        self,
        *,
        user_id: int,
        question_id: str,
    ) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT correct_answer_json, knowledge_point_id FROM math_variant_answers
                WHERE user_id = ? AND question_id = ?
                """,
                (user_id, question_id),
            ).fetchone()
        if row is None:
            return None
        try:
            return {
                "correct_answer": json.loads(str(row["correct_answer_json"])),
                "knowledge_point_id": row["knowledge_point_id"],
            }
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    @staticmethod
    def _ensure_column(
        connection: sqlite3.Connection,
        table_name: str,
        column_name: str,
        column_definition: str,
    ) -> None:
        columns = {
            str(row["name"])
            for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name not in columns:
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_definition}")

    def _backfill_staged_upload_expiries(self, connection: sqlite3.Connection) -> None:
        """把升级前的暂存图片补上创建后 24 小时的过期时间。"""

        rows = connection.execute(
            """
            SELECT id, created_at FROM wrong_question_uploads
            WHERE status = 'staged' AND expires_at IS NULL
            """
        ).fetchall()
        for row in rows:
            connection.execute(
                "UPDATE wrong_question_uploads SET expires_at = ? WHERE id = ?",
                (self._staged_upload_expiry(str(row["created_at"])), str(row["id"])),
            )

    @staticmethod
    def _staged_upload_expiry(created_at: str) -> str:
        try:
            created = datetime.fromisoformat(created_at)
        except ValueError:
            created = datetime.now(timezone.utc)
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        return (created + timedelta(hours=24)).isoformat()

    @staticmethod
    def _wrong_question_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        record = dict(row)
        # 错题列表和详情均不能意外携带图片二进制；图片必须走专用读取接口。
        record.pop("source_image", None)
        try:
            record["knowledge_points"] = json.loads(record.pop("knowledge_points_json"))
        except (KeyError, json.JSONDecodeError):
            record["knowledge_points"] = []
        record["has_image"] = bool(record.get("has_image", False))
        record["analysis_status"] = str(record.get("analysis_status") or "not_requested")
        return record

    @staticmethod
    def _student_course_context_row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        record = dict(row)
        try:
            knowledge_point_ids = json.loads(str(record.pop("knowledge_point_ids_json")))
        except (KeyError, json.JSONDecodeError):
            knowledge_point_ids = []
        record["knowledge_point_ids"] = (
            knowledge_point_ids
            if isinstance(knowledge_point_ids, list)
            and all(isinstance(item, str) for item in knowledge_point_ids)
            else []
        )
        return record

    @staticmethod
    def _daily_task_row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        record = dict(row)
        raw_course_context = record.pop("course_context_json", None)
        if raw_course_context:
            try:
                course_context = json.loads(str(raw_course_context))
            except json.JSONDecodeError:
                course_context = None
            record["course_context"] = course_context if isinstance(course_context, dict) else None
        else:
            record["course_context"] = None
        return record

    @staticmethod
    def _upload_metadata_row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        record = dict(row)
        raw_ocr_result = record.pop("ocr_result_json", None)
        if raw_ocr_result:
            try:
                record["ocr_result"] = json.loads(str(raw_ocr_result))
            except json.JSONDecodeError:
                record["ocr_result"] = None
        else:
            record["ocr_result"] = None
        return record

    @staticmethod
    def _wrong_question_select_sql(where_clause: str) -> str:
        """返回不包含图片 BLOB 的统一错题查询。"""

        return f"""
            SELECT id, user_id, subject, question_text, knowledge_points_json,
                   error_reason, source_upload_id, analysis_status, analysis_summary,
                   created_at, updated_at,
                   CASE
                       WHEN source_upload_id IS NOT NULL OR source_image IS NOT NULL THEN 1
                       ELSE 0
                   END AS has_image
            FROM wrong_questions
            {where_clause}
        """

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _get_user_by_id_with_connection(
        connection: sqlite3.Connection,
        user_id: int,
    ) -> dict[str, Any] | None:
        row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row is not None else None
