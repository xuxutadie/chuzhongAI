"""学生账户与学习工作台的业务规则。"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.services.math_curriculum import ADDITIONAL_COURSE_CHAPTERS, ADDITIONAL_QUESTIONS
from app.services.language_curriculum import LANGUAGE_UNITS, LANGUAGE_TASKS, validate_language_evidence
from app.services.subject_visibility import is_subject_enabled

from app.repositories.student_workspace_repository import (
    DailyTaskNotStartedError,
    DuplicateUsernameError,
    StudentWorkspaceRepository,
    WrongQuestionUploadAlreadyAttachedError,
    WrongQuestionUploadNotFoundError,
)


class StudentWorkspaceError(Exception):
    """学生工作台接口可安全返回给前端的业务错误。"""

    status_code = 400


class AuthenticationError(StudentWorkspaceError):
    status_code = 401


class AuthenticationRateLimitError(AuthenticationError):
    """连续失败登录的短时保护，避免对学生账号进行高频猜测。"""

    status_code = 429

    def __init__(
        self,
        retry_after_seconds: int,
        *,
        message: str = "登录尝试次数过多，请稍后再试",
    ) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class RegistrationRateLimitError(AuthenticationRateLimitError):
    """沿用认证接口的 429 与 Retry-After 响应契约。"""

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__(retry_after_seconds, message="注册尝试次数过多，请稍后再试")


class AIRequestRateLimitError(StudentWorkspaceError):
    """限制单个学生高频调用付费 AI 能力，避免共享模型额度被滥用。"""

    status_code = 429

    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("该 AI 功能请求过于频繁，请稍后再试")
        self.retry_after_seconds = retry_after_seconds


class AuthorizationError(StudentWorkspaceError):
    status_code = 403


class ResourceNotFoundError(StudentWorkspaceError):
    status_code = 404


class ResourceConflictError(StudentWorkspaceError):
    status_code = 409


class CourseContextRequiredError(ResourceConflictError):
    """当天还没有任务快照时，学生必须先从可信课程目录选择内容。"""

    course_context_required = True

    def __init__(self) -> None:
        super().__init__("请先选择已导入的课程内容，再查看或开始今天的学习任务")


class PayloadTooLargeError(StudentWorkspaceError):
    status_code = 413


class UnsupportedMediaTypeError(StudentWorkspaceError):
    status_code = 415


@dataclass(frozen=True)
class DailyTaskTemplate:
    id: str
    subject: str
    title: str
    objective: str
    learning_href: str
    growth_earned: int


# 与当前学生端首屏任务保持同一组稳定 ID，前端接入服务端时无需猜测映射关系。
DAILY_TASK_TEMPLATES: tuple[DailyTaskTemplate, ...] = (
    DailyTaskTemplate(
        id="math-shapes-diagnosis",
        subject="数学",
        title="数学课堂诊断",
        objective="根据今天课堂内容完成图形世界诊断，找出需要巩固的知识点。",
        learning_href="/today-learning",
        growth_earned=40,
    ),
    DailyTaskTemplate(
        id="english-20",
        subject="英语",
        title="核心词汇与短文复述",
        objective="学会 5 个学习主题词汇，并用自己的话完成短文复述。",
        learning_href="/tasks/english-20",
        growth_earned=40,
    ),
    DailyTaskTemplate(
        id="chinese-20",
        subject="语文",
        title="阅读理解精练",
        objective="读懂一篇短文，练习找依据并把理由写完整。",
        learning_href="/tasks/chinese-20",
        growth_earned=40,
    ),
)


# 课程目录不是浏览器演示数据：只登记已经导入、且后端能为其完成可信判分的内容。
# 已接入北师大版七年级上册六章；独立互动素材不自动成为可判分课程。
REGISTERED_COURSE_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "nnu-math-g7-upper",
        "subject": "数学",
        "textbook_version": "北师大版",
        "grade": 7,
        "semester": "上册",
        "chapters": (
            {
                "id": "g7u-chapter-1",
                "title": "第一章 丰富的图形世界",
                "knowledge_points": (
                    {"id": "g7u-shapes-solid", "title": "生活中的立体图形"},
                    {"id": "g7u-shapes-folding", "title": "展开与折叠"},
                    {"id": "g7u-shapes-section", "title": "截一个几何体"},
                    {"id": "g7u-shapes-views", "title": "从三个方向看物体"},
                ),
            },
        ) + ADDITIONAL_COURSE_CHAPTERS,
    },
)


# 引导任务的答案与完成规则也放在服务端，不能只依赖浏览器禁用按钮。
GUIDED_TASK_COMPLETION_RULES: dict[str, dict[str, Any]] = {
    "english-20": {
        "reflection_min_length": 12,
        "minimum_correct_count": 2,
        "answers": {
            "english-q1": "habit",
            "english-q2": "复习",
            "english-q3": "Practice makes me confident.",
        },
    },
    "chinese-20": {
        "reflection_min_length": 18,
        "minimum_correct_count": 2,
        "answers": {
            "chinese-q1": "发现值日牌被风吹倒",
            "chinese-q2": "主动为集体做事也是成长",
            "chinese-q3": "排水恢复，积水开始退去",
        },
    },
}

MAX_WORKSPACE_STATE_BYTES = 256 * 1024
MAX_WRONG_QUESTION_IMAGE_BYTES = 5 * 1024 * 1024
SUPPORTED_WRONG_QUESTION_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}


# 第一章保留原有稳定题号；第二至六章从共享能力包登记可信答案。
# 前端提交的是作答，不是它自行计算的分数；服务端必须重新判分。
MATH_DIAGNOSIS_ANSWER_KEY: dict[str, str | list[str] | dict[str, Any]] = {
    **{question_id: question["correctAnswer"] for question_id, question in ADDITIONAL_QUESTIONS.items()},
    "solid-01": "a", "solid-02": "b", "solid-03": "true", "solid-04": ["a", "b", "d"],
    "solid-05": "c", "solid-06": "true", "solid-07": ["a", "b"], "solid-08": "a",
    "solid-09": {"challengeId": "solid-cube-parts", "passed": True},
    "solid-10": {"challengeId": "solid-cylinder-surfaces", "passed": True},
    "fold-01": "c", "fold-02": "false", "fold-03": "c", "fold-04": ["a", "b", "c"],
    "fold-05": "true", "fold-06": "c", "fold-07": ["a", "b", "d"], "fold-08": "b",
    "fold-09": {"challengeId": "fold-cross-net", "passed": True},
    "fold-10": {"challengeId": "fold-opposite-face", "passed": True},
    "section-01": "a", "section-02": "true", "section-03": "d", "section-04": ["a", "b", "c", "d"],
    "section-05": "false", "section-06": "a", "section-07": ["a", "b", "c"], "section-08": "d",
    "section-09": {"challengeId": "cut-cube-triangle", "passed": True},
    "section-10": {"challengeId": "cut-cube-hexagon", "passed": True},
    "views-01": "a", "views-02": "true", "views-03": ["a", "b", "c"], "views-04": "a",
    "views-05": "b", "views-06": "true", "views-07": ["a", "b", "c"], "views-08": "b",
    "views-09": {"challengeId": "views-match-front", "passed": True},
    "views-10": {"challengeId": "views-rebuild-solid", "passed": True},
}

# 只有题库中确实依赖图形或互动操作的题目，才允许切换到文字备用题。
# 此表同时是服务端判分白名单：不能根据任意 "-text-fallback" 后缀猜测答案。
MATH_TEXT_FALLBACK_ANSWER_KEY: dict[str, str] = {
    "solid-02-text-fallback": "b",
    "solid-03-text-fallback": "true",
    "solid-05-text-fallback": "c",
    "solid-06-text-fallback": "true",
    "solid-09-text-fallback": "true",
    "solid-10-text-fallback": "true",
    "fold-02-text-fallback": "false",
    "fold-03-text-fallback": "c",
    "fold-05-text-fallback": "true",
    "fold-08-text-fallback": "b",
    "fold-09-text-fallback": "true",
    "fold-10-text-fallback": "true",
    "section-01-text-fallback": "a",
    "section-02-text-fallback": "true",
    "section-03-text-fallback": "d",
    "section-06-text-fallback": "a",
    "section-08-text-fallback": "d",
    "section-09-text-fallback": "true",
    "section-10-text-fallback": "true",
    "views-04-text-fallback": "a",
    "views-05-text-fallback": "b",
    "views-08-text-fallback": "b",
    "views-09-text-fallback": "true",
    "views-10-text-fallback": "true",
}


# 题库 ID 是服务端可信题目的归属依据。文字备用题沿用原题前缀，不能由客户端自由声明知识点。
MATH_QUESTION_KNOWLEDGE_POINT_PREFIXES: tuple[tuple[str, str], ...] = (
    ("solid-", "g7u-shapes-solid"),
    ("fold-", "g7u-shapes-folding"),
    ("section-", "g7u-shapes-section"),
    ("views-", "g7u-shapes-views"),
)


class StudentWorkspaceService:
    """封装密码、令牌、角色与学习状态的业务规则。"""

    _username_whitespace = re.compile(r"\s")
    _login_attempt_lock = threading.Lock()
    _failed_login_attempts: dict[str, list[float]] = {}
    _login_failure_window_seconds = 5 * 60
    _maximum_login_failures = 5
    _registration_attempt_lock = threading.Lock()
    _registration_attempts: dict[str, list[float]] = {}
    _registration_window_seconds = 15 * 60
    _maximum_registration_attempts = 10
    # 活跃来源达到上限时拒绝新来源，不淘汰正在限流的来源，以免绕过限制。
    _maximum_registration_sources = 4_096
    # 这是按已认证学生 ID 统计的进程内短窗口保护，而不是按可伪造的客户端 IP。
    # 缓存命中不计入；窗口内的实际外部模型调用才会占用一次额度。
    _ai_request_lock = threading.Lock()
    _ai_request_attempts: dict[tuple[int, str], list[float]] = {}
    _ai_rate_limits: dict[str, tuple[int, int]] = {
        "diagnosis_interview": (5 * 60, 24),
        "diagnosis_report": (5 * 60, 3),
        "ocr": (5 * 60, 6),
        "wrong_question_analysis": (5 * 60, 6),
        "assistant": (5 * 60, 12),
        "math_variant": (5 * 60, 6),
    }

    def __init__(self, repository: StudentWorkspaceRepository, session_ttl_hours: int = 12) -> None:
        self.repository = repository
        self.session_ttl_hours = session_ttl_hours

    def bootstrap_admin(
        self,
        *,
        username: str,
        password: str,
        display_name: str,
    ) -> dict[str, Any]:
        cleaned_username = self._validate_username(username)
        cleaned_password = self._validate_password(password)
        cleaned_name = self._validate_display_name(display_name)
        try:
            user = self.repository.create_first_admin(
                username=cleaned_username,
                password_hash=self._hash_password(cleaned_password),
                display_name=cleaned_name,
            )
        except DuplicateUsernameError as error:
            raise ResourceConflictError(str(error)) from error
        if user is None:
            raise ResourceConflictError("首次管理员已经创建，请直接登录")
        return self._create_authenticated_response(user)

    def login(self, *, username: str, password: str) -> dict[str, Any]:
        cleaned_username = self._validate_username(username)
        self._require_login_attempt_allowed(cleaned_username)
        user = self.repository.get_user_by_username(cleaned_username)
        if user is None or not self._verify_password(password, str(user["password_hash"])) or not self.repository.account_is_active(user['id']):
            # 不区分用户名和密码错误，避免泄露账号是否存在。
            self._record_failed_login(cleaned_username)
            raise AuthenticationError("账号或密码错误")
        self._clear_failed_logins(cleaned_username)
        return self._create_authenticated_response(user)

    def register_student(
        self,
        *,
        username: str,
        password: str,
        display_name: str,
        grade: str | None = None,
    ) -> dict[str, Any]:
        """学生可独立注册；身份与 API 来源由服务端固定，不能由表单指定。"""

        cleaned_username = self._validate_username(username)
        cleaned_password = self._validate_password(password)
        cleaned_name = self._validate_display_name(display_name)
        cleaned_grade = self._normalize_optional_text(grade, "年级", 24)
        try:
            student = self.repository.create_user(
                username=cleaned_username,
                password_hash=self._hash_password(cleaned_password),
                display_name=cleaned_name,
                role="student",
                created_by=None,
                grade=cleaned_grade,
            )
        except DuplicateUsernameError as error:
            raise ResourceConflictError(str(error)) from error
        return self._create_authenticated_response(student)

    def logout(self, access_token: str) -> None:
        self.repository.delete_session(self._hash_token(access_token))

    def get_current_user(self, access_token: str) -> dict[str, Any]:
        user = self.repository.get_session_user(self._hash_token(access_token), self._now())
        if user is None:
            raise AuthenticationError("登录已失效，请重新登录")
        return self._public_user(user)

    def create_student(
        self,
        *,
        teacher: dict[str, Any],
        username: str,
        password: str,
        display_name: str,
        grade: str | None,
    ) -> dict[str, Any]:
        self.require_role(teacher, "admin")
        try:
            student = self.repository.create_user(
                username=self._validate_username(username),
                password_hash=self._hash_password(self._validate_password(password)),
                display_name=self._validate_display_name(display_name),
                role="student",
                created_by=int(teacher["id"]),
                grade=self._normalize_optional_text(grade, "年级", 24),
            )
        except DuplicateUsernameError as error:
            raise ResourceConflictError(str(error)) from error
        return self._public_user(student)

    def list_students(self, *, teacher: dict[str, Any]) -> list[dict[str, Any]]:
        self.require_role(teacher, "admin")
        return [
            self._public_user(student)
            for student in self.repository.list_students(int(teacher["id"]))
        ]

    def create_students_batch(
        self,
        *,
        teacher: dict[str, Any],
        students: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """整批校验通过后原子创建，任何一行冲突都不能留下半批账号。"""

        self.require_role(teacher, "admin")
        if not 1 <= len(students) <= 50:
            raise StudentWorkspaceError("每次批量创建需为 1 至 50 位学生")
        cleaned_students: list[dict[str, Any]] = []
        seen_usernames: set[str] = set()
        for row_number, student in enumerate(students, start=1):
            username = self._validate_username(student["username"])
            if username.casefold() in seen_usernames:
                raise ResourceConflictError(f"第 {row_number} 行账号在本批次内重复，请修改后重新提交")
            seen_usernames.add(username.casefold())
            cleaned_students.append({
                "username": username,
                "password": self._validate_password(student["password"]),
                "display_name": self._validate_display_name(student["display_name"]),
                "grade": self._normalize_optional_text(student.get("grade"), "年级", 24),
            })
        # 先完成所有轻量校验，再计算密码哈希；明文不进入仓储或返回结果。
        stored_students = [
            {"username": student["username"],
             "password_hash": self._hash_password(student["password"]),
             "display_name": student["display_name"], "grade": student["grade"]}
            for student in cleaned_students
        ]
        try:
            created = self.repository.create_students_batch(
                created_by=int(teacher["id"]), students=stored_students
            )
        except DuplicateUsernameError as error:
            raise ResourceConflictError("本批次中有账号已被使用，整批未创建，请检查后重试") from error
        return [self._public_user(student) for student in created]

    def reset_student_password(
        self,
        *,
        teacher: dict[str, Any],
        student_id: int,
        password: str,
    ) -> None:
        """教师只能重置自己创建的学生账号，重置后强制其重新登录。"""

        self.require_role(teacher, "admin")
        updated = self.repository.reset_owned_student_password(
            teacher_id=int(teacher["id"]),
            student_id=student_id,
            password_hash=self._hash_password(self._validate_password(password)),
        )
        if not updated:
            raise ResourceNotFoundError("未找到可管理的学生账号")

    def get_profile(self, *, user: dict[str, Any]) -> dict[str, Any]:
        return self._public_user(user)

    def get_course_catalog(self, *, user: dict[str, Any]) -> dict[str, Any]:
        """返回当前确实可学习的课程目录，而不是前端演示课程。"""

        self.require_role(user, "student")
        return {"courses": [self._public_course_catalog_entry(course) for course in REGISTERED_COURSE_CATALOG]}

    def get_course_context(self, *, user: dict[str, Any]) -> dict[str, Any] | None:
        self.require_role(user, "student")
        return self._get_course_context_for_user_id(int(user["id"]))

    def save_course_context(
        self,
        *,
        user: dict[str, Any],
        course_id: str,
        chapter_id: str,
        knowledge_point_ids: list[str],
    ) -> dict[str, Any]:
        """只接受服务端已登记的课程/章节/知识点组合。"""

        self.require_role(user, "student")
        snapshot = self._resolve_course_context(
            course_id=course_id,
            chapter_id=chapter_id,
            knowledge_point_ids=knowledge_point_ids,
        )
        stored = self.repository.save_student_course_context(
            user_id=int(user["id"]),
            course_id=snapshot["course_id"],
            chapter_id=snapshot["chapter_id"],
            knowledge_point_ids=[item["id"] for item in snapshot["knowledge_points"]],
        )
        return {**snapshot, "updated_at": str(stored["updated_at"])}

    def require_selected_math_knowledge_point(
        self,
        *,
        user: dict[str, Any],
        knowledge_point_id: str,
    ) -> None:
        """AI 变式题也必须落在学生当前已选且后端可信的知识点内。"""

        self.require_role(user, "student")
        context = self._get_course_context_for_user_id(int(user["id"]))
        if context is None:
            raise CourseContextRequiredError()
        selected_ids = {str(item["id"]) for item in context["knowledge_points"]}
        if knowledge_point_id not in selected_ids:
            raise StudentWorkspaceError("当前课程未选择这个知识点，请先调整课程内容后再生成变式题")

    def get_workspace_state(self, *, user: dict[str, Any]) -> dict[str, Any]:
        self.require_role(user, "student")
        return self.repository.get_workspace_state(int(user["id"]))

    def save_workspace_state(
        self,
        *,
        user: dict[str, Any],
        state: dict[str, Any],
    ) -> dict[str, Any]:
        self.require_role(user, "student")
        if not isinstance(state, dict):
            raise StudentWorkspaceError("学习状态必须是对象")
        try:
            serialized_state = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError, RecursionError) as error:
            raise StudentWorkspaceError("学习状态格式无效，请刷新后重试") from error
        if len(serialized_state.encode("utf-8")) > MAX_WORKSPACE_STATE_BYTES:
            raise PayloadTooLargeError("学习草稿过大，请保留当前任务需要的内容后再保存")
        return self.repository.save_workspace_state(int(user["id"]), state)

    def upload_wrong_question_image(
        self,
        *,
        user: dict[str, Any],
        media_type: str,
        image_data: bytes,
    ) -> dict[str, Any]:
        """校验并暂存原始图片，避免把 Base64 图片塞进浏览器学习状态。"""

        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        normalized_type = media_type.split(";", 1)[0].strip().lower()
        if normalized_type not in SUPPORTED_WRONG_QUESTION_IMAGE_TYPES:
            raise UnsupportedMediaTypeError("仅支持 JPG、PNG 或 WebP 格式的错题图片")
        if not image_data:
            raise StudentWorkspaceError("请选择一张包含题目的图片后再上传")
        if len(image_data) > MAX_WRONG_QUESTION_IMAGE_BYTES:
            raise PayloadTooLargeError("单张错题图片不能超过 5MB，请压缩后重试")
        if not self._matches_image_signature(normalized_type, image_data):
            raise StudentWorkspaceError("图片内容与所选格式不一致，请重新选择 JPG、PNG 或 WebP 图片")
        upload_id = f"upload-{secrets.token_urlsafe(18)}"
        return self.repository.create_wrong_question_upload(
            upload_id=upload_id,
            user_id=int(user["id"]),
            media_type=normalized_type,
            image_data=image_data,
        )

    def get_wrong_question_upload(self, *, user: dict[str, Any], upload_id: str) -> dict[str, Any]:
        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        upload = self.repository.get_wrong_question_upload_image(
            user_id=int(user["id"]), upload_id=upload_id
        )
        if upload is None:
            raise ResourceNotFoundError("未找到这张错题图片")
        return upload

    def get_cached_ocr_result(
        self,
        *,
        user: dict[str, Any],
        upload_id: str,
    ) -> dict[str, Any] | None:
        """只读取当前学生上传记录中的已验证 OCR 候选，不读取图片二进制。"""

        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        upload = self.repository.get_wrong_question_upload_metadata(
            user_id=int(user["id"]),
            upload_id=upload_id,
        )
        if upload is None:
            # 与图片读取保持同一错误语义，避免通过 OCR 缓存探测其他学生资源。
            raise ResourceNotFoundError("未找到这张错题图片")
        return self._validated_cached_ocr_result(upload.get("ocr_result"))

    def delete_staged_wrong_question_upload(self, *, user: dict[str, Any], upload_id: str) -> None:
        """允许学生在确认题干前主动清理换图或取消操作留下的原始图片。"""

        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        result = self.repository.delete_staged_wrong_question_upload(
            user_id=int(user["id"]),
            upload_id=upload_id,
        )
        if result == "not_found":
            raise ResourceNotFoundError("未找到这张待确认图片")
        if result == "attached":
            raise ResourceConflictError("图片已经加入错题集，请删除整条错题后再移除图片")

    def create_wrong_question(
        self,
        *,
        user: dict[str, Any],
        subject: str,
        question_text: str,
        knowledge_points: list[str] | None = None,
        error_reason: str | None = None,
        source_upload_id: str | None = None,
    ) -> dict[str, Any]:
        """题干必须由学生确认后才能把暂存图片正式写入错题集。"""

        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        try:
            return self.repository.create_wrong_question(
                user_id=int(user["id"]),
                subject=self._validate_wrong_question_subject(subject),
                question_text=self._validate_wrong_question_text(question_text),
                knowledge_points=self._normalize_knowledge_points(knowledge_points or []),
                error_reason=self._normalize_optional_text(error_reason, "错误原因", 500),
                source_upload_id=source_upload_id,
            )
        except WrongQuestionUploadNotFoundError as error:
            raise ResourceNotFoundError(str(error)) from error
        except WrongQuestionUploadAlreadyAttachedError as error:
            raise ResourceConflictError(str(error)) from error

    def list_wrong_questions(self, *, user: dict[str, Any]) -> list[dict[str, Any]]:
        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        return [
            self._public_wrong_question(question)
            for question in self.repository.list_wrong_questions(int(user["id"]))
        ]

    def get_wrong_question_page(
        self,
        *,
        user: dict[str, Any],
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        user_id = int(user["id"])
        questions = self.repository.list_wrong_questions(user_id, limit=limit, offset=offset)
        return {
            "questions": [self._public_wrong_question(question) for question in questions],
            "total": self.repository.count_wrong_questions(user_id),
            "limit": limit,
            "offset": offset,
        }

    def get_wrong_question(self, *, user: dict[str, Any], question_id: int) -> dict[str, Any]:
        self.require_role(user, "student")
        question = self.repository.get_wrong_question(user_id=int(user["id"]), question_id=question_id)
        if question is None:
            raise ResourceNotFoundError("未找到这条错题")
        return self._public_wrong_question(question)

    def get_cached_wrong_question_analysis(
        self,
        *,
        user: dict[str, Any],
        question_id: int,
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        """返回已有的可信错因分析；无缓存时保留题目供后续模型请求使用。"""

        question = self.get_wrong_question(user=user, question_id=question_id)
        if str(question.get("analysis_status")) != "completed":
            return question, None
        error_reason = question.get("error_reason")
        suggestion = question.get("analysis_summary")
        knowledge_points = question.get("knowledge_points")
        if (
            not isinstance(error_reason, str)
            or not error_reason.strip()
            or not isinstance(suggestion, str)
            or not suggestion.strip()
            or not isinstance(knowledge_points, list)
            or any(not isinstance(item, str) or not item.strip() for item in knowledge_points)
        ):
            # 兼容历史记录：缺失完整分析时宁可重新分析，也不返回不完整缓存。
            return question, None
        return question, {
            "error_reason": error_reason,
            "knowledge_points": list(knowledge_points),
            "suggestion": suggestion,
            # 旧表未存储模型耗时；明确标识为缓存而不是伪造新的模型调用元数据。
            "model_name": "缓存结果",
            "latency_ms": 0,
        }

    def update_wrong_question(
        self,
        *,
        user: dict[str, Any],
        question_id: int,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        self.require_role(user, "student")
        normalized_updates: dict[str, Any] = {}
        if "subject" in updates:
            normalized_updates["subject"] = self._validate_wrong_question_subject(updates["subject"])
        if "question_text" in updates:
            normalized_updates["question_text"] = self._validate_wrong_question_text(updates["question_text"])
        if "knowledge_points" in updates:
            normalized_updates["knowledge_points"] = self._normalize_knowledge_points(updates["knowledge_points"])
        if "error_reason" in updates:
            raw_reason = updates["error_reason"]
            if raw_reason is not None and not isinstance(raw_reason, str):
                raise StudentWorkspaceError("错误原因格式无效")
            normalized_updates["error_reason"] = (
                self._normalize_optional_text(raw_reason, "错误原因", 500) if raw_reason is not None else None
            )
            normalized_updates["clear_error_reason"] = raw_reason is None
        if not normalized_updates:
            raise StudentWorkspaceError("请至少修改一项错题内容")
        question = self.repository.update_wrong_question(
            user_id=int(user["id"]), question_id=question_id, **normalized_updates
        )
        if question is None:
            raise ResourceNotFoundError("未找到这条错题")
        return self._public_wrong_question(question)

    def delete_wrong_question(self, *, user: dict[str, Any], question_id: int) -> None:
        self.require_role(user, "student")
        if not self.repository.delete_wrong_question(user_id=int(user["id"]), question_id=question_id):
            raise ResourceNotFoundError("未找到这条错题")

    def get_wrong_question_image(self, *, user: dict[str, Any], question_id: int) -> dict[str, Any]:
        self.require_role(user, "student")
        image = self.repository.get_wrong_question_image(
            user_id=int(user["id"]), question_id=question_id
        )
        if image is None:
            # 统一以 404 处理无权和无图片，避免侧信道暴露其他学生的图片。
            raise ResourceNotFoundError("未找到这张错题图片")
        return image

    def save_ocr_result(
        self,
        *,
        user: dict[str, Any],
        upload_id: str,
        result: dict[str, Any],
    ) -> None:
        self.require_role(user, "student")
        self._cleanup_expired_staged_wrong_question_uploads()
        if not self.repository.save_wrong_question_upload_ocr_result(
            user_id=int(user["id"]), upload_id=upload_id, result=result
        ):
            raise ResourceNotFoundError("未找到这张待识别图片")

    def require_ai_request_allowed(self, *, user: dict[str, Any], capability: str) -> None:
        """在真正请求外部模型前登记一次学生维度的额度使用。"""

        self.require_role(user, "student")
        self._require_ai_request_allowed(user_id=int(user["id"]), capability=capability)

    def _cleanup_expired_staged_wrong_question_uploads(self) -> None:
        """让上传、浏览和确认流程自然回收未确认的临时图片。"""

        self.repository.delete_expired_staged_wrong_question_uploads()

    def save_wrong_question_analysis(
        self,
        *,
        user: dict[str, Any],
        question_id: int,
        error_reason: str,
        knowledge_points: list[str],
        suggestion: str,
    ) -> dict[str, Any]:
        self.require_role(user, "student")
        question = self.repository.save_wrong_question_analysis(
            user_id=int(user["id"]),
            question_id=question_id,
            error_reason=self._normalize_optional_text(error_reason, "错误原因", 500) or "",
            knowledge_points=self._normalize_knowledge_points(knowledge_points),
            suggestion=self._normalize_optional_text(suggestion, "学习建议", 1_000) or "",
        )
        if question is None:
            raise ResourceNotFoundError("未找到这条错题")
        return self._public_wrong_question(question)

    def register_math_variant_answer(
        self,
        *,
        user: dict[str, Any],
        question_id: str,
        correct_answer: Any,
        knowledge_point_id: str | None = None,
    ) -> None:
        """仅供后端生成服务调用，把本学生的 AI 变式答案登记为可信来源。"""

        self.require_role(user, "student")
        if not question_id.startswith("ai-") or len(question_id) > 80:
            raise StudentWorkspaceError("AI 变式题编号无效")
        if self._canonical_math_answer(correct_answer) is None:
            raise StudentWorkspaceError("AI 变式题答案格式无效")
        if knowledge_point_id is not None and knowledge_point_id not in self._registered_knowledge_point_ids():
            raise StudentWorkspaceError("AI 变式题知识点不在已导入课程中")
        self.repository.register_math_variant_answer(
            user_id=int(user["id"]),
            question_id=question_id,
            correct_answer=correct_answer,
            knowledge_point_id=knowledge_point_id,
        )

    def get_today_tasks(self, *, user: dict[str, Any]) -> dict[str, Any]:
        self.require_role(user, "student")
        user_id = int(user["id"])
        task_date = self._today()
        tasks, course_context = self._prepare_today_tasks(user_id=user_id, task_date=task_date)
        return {
            "task_date": task_date,
            "tasks": [self._public_task(task) for task in tasks],
            "growth_earned": self.repository.get_today_growth_earned(user_id, task_date),
            "course_context": course_context,
        }

    def get_language_progress(self, *, user: dict[str, Any]) -> dict[str, Any]:
        """返回当前学生自己的语文、英语单元学习历史。"""

        self.require_role(user, "student")
        return {"units": self.repository.list_language_unit_history(int(user["id"]))}

    def start_today_task(self, *, user: dict[str, Any], task_id: str) -> dict[str, Any]:
        self.require_role(user, "student")
        user_id = int(user["id"])
        task_date = self._today()
        if task_id.startswith("language-") and task_id not in LANGUAGE_TASKS:
            raise ResourceNotFoundError("没有找到这个语文或英语单元")
        if task_id in LANGUAGE_TASKS:
            book, unit = LANGUAGE_TASKS[task_id]
            # 学生明确点击开始后才创建该单元任务；无需先做数学，每日同一单元只建一行。
            self.repository.ensure_daily_tasks(user_id=user_id, task_date=task_date, tasks=[{
                "id": task_id, "subject": book["subject"],
                "title": f"{book['subject']}·{book['semester']}·{unit['title']}",
                "objective": unit["focus"], "growth_earned": 20,
                "learning_href": f"/subjects/{'english' if book['subject'] == '英语' else 'chinese'}/{unit['id']}",
                "course_context": {
                    "course_id": book["id"], "subject": book["subject"], "textbook_version": book["edition"],
                    "grade": int(book["grade"]), "semester": book["semester"], "chapter_id": unit["id"], "chapter_title": unit["title"],
                    "knowledge_points": [{"id": s["id"], "title": s["title"]} for s in unit["skills"]],
                },
            }])
        self._prepare_today_tasks(user_id=user_id, task_date=task_date)
        self._require_task_prerequisites(
            user_id=user_id,
            task_date=task_date,
            task_id=task_id,
        )
        task = self.repository.start_daily_task(
            user_id=user_id,
            task_date=task_date,
            task_id=task_id,
        )
        if task is None:
            raise ResourceNotFoundError("今天没有这项学习任务")
        return self._public_task(task)

    def complete_today_task(
        self,
        *,
        user: dict[str, Any],
        task_id: str,
        reflection: str,
        evidence: dict[str, Any],
    ) -> dict[str, Any]:
        self.require_role(user, "student")
        cleaned_reflection = self._normalize_optional_text(reflection, "学习反思", 1_000)
        if not cleaned_reflection:
            raise StudentWorkspaceError("完成任务前请先填写学习反思")
        user_id = int(user["id"])
        task_date = self._today()
        is_language_task = task_id in LANGUAGE_TASKS
        if task_id.startswith("language-") and not is_language_task:
            raise ResourceNotFoundError("今天没有这项语言学习任务")
        if not is_language_task:
            self._prepare_today_tasks(user_id=user_id, task_date=task_date)
            self._require_task_prerequisites(
                user_id=user_id,
                task_date=task_date,
                task_id=task_id,
            )
        task = self.repository.get_daily_task(
            user_id=user_id,
            task_date=task_date,
            task_id=task_id,
        )
        if task is None:
            if is_language_task:
                raise ResourceNotFoundError("请先开始本单元学习，再提交完成结果")
            raise ResourceNotFoundError("今天没有这项学习任务")
        self._validate_task_completion_evidence(
            user_id=user_id,
            task_id=task_id,
            reflection=cleaned_reflection,
            evidence=evidence,
            allowed_knowledge_point_ids=self._task_snapshot_knowledge_point_ids(task),
        )
        try:
            task, was_already_completed = self.repository.complete_daily_task(
                user_id=user_id,
                task_date=task_date,
                task_id=task_id,
                reflection=cleaned_reflection,
            )
        except DailyTaskNotStartedError as error:
            raise ResourceConflictError(str(error)) from error
        if task is None:
            raise ResourceNotFoundError("今天没有这项学习任务")
        return {
            "task": self._public_task(task),
            "was_already_completed": was_already_completed,
        }

    @staticmethod
    def require_role(user: dict[str, Any], *allowed_roles: str) -> None:
        if str(user.get("role")) not in allowed_roles:
            raise AuthorizationError("当前账号无权访问该资源")

    def _get_course_context_for_user_id(self, user_id: int) -> dict[str, Any] | None:
        stored = self.repository.get_student_course_context(user_id)
        if stored is None:
            return None
        try:
            snapshot = self._resolve_course_context(
                course_id=stored.get("course_id"),
                chapter_id=stored.get("chapter_id"),
                knowledge_point_ids=stored.get("knowledge_point_ids"),
            )
        except StudentWorkspaceError:
            # 目录升级后不让坏的旧 ID 继续创建任务；学生可重新选择可用课程。
            return None
        return {**snapshot, "updated_at": str(stored.get("updated_at") or "")}

    @staticmethod
    def _public_course_catalog_entry(course: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(course["id"]),
            "subject": str(course["subject"]),
            "textbook_version": str(course["textbook_version"]),
            "grade": int(course["grade"]),
            "semester": str(course["semester"]),
            "chapters": [
                {
                    "id": str(chapter["id"]),
                    "title": str(chapter["title"]),
                    "knowledge_points": [
                        {"id": str(item["id"]), "title": str(item["title"])}
                        for item in chapter["knowledge_points"]
                    ],
                }
                for chapter in course["chapters"]
            ],
        }

    @classmethod
    def _resolve_course_context(
        cls,
        *,
        course_id: Any,
        chapter_id: Any,
        knowledge_point_ids: Any,
    ) -> dict[str, Any]:
        """通过稳定 ID 解析完整显示信息，拒绝未导入内容和客户端伪造标题。"""

        if not isinstance(course_id, str) or not isinstance(chapter_id, str):
            raise StudentWorkspaceError("课程选择格式无效")
        if not isinstance(knowledge_point_ids, list) or not knowledge_point_ids:
            raise StudentWorkspaceError("请至少选择一个已导入知识点")
        if len(knowledge_point_ids) > 4 or any(not isinstance(item, str) for item in knowledge_point_ids):
            raise StudentWorkspaceError("课程知识点选择格式无效")
        if len(set(knowledge_point_ids)) != len(knowledge_point_ids):
            raise StudentWorkspaceError("课程知识点不能重复选择")

        course = next(
            (item for item in REGISTERED_COURSE_CATALOG if item["id"] == course_id),
            None,
        )
        if course is None:
            raise StudentWorkspaceError("所选课程尚未导入可信题库内容")
        chapter = next(
            (item for item in course["chapters"] if item["id"] == chapter_id),
            None,
        )
        if chapter is None:
            raise StudentWorkspaceError("所选章节不属于当前已导入课程")
        knowledge_points_by_id = {
            str(item["id"]): item for item in chapter["knowledge_points"]
        }
        if any(item not in knowledge_points_by_id for item in knowledge_point_ids):
            raise StudentWorkspaceError("所选知识点不属于当前已导入章节")
        return {
            "course_id": str(course["id"]),
            "subject": str(course["subject"]),
            "textbook_version": str(course["textbook_version"]),
            "grade": int(course["grade"]),
            "semester": str(course["semester"]),
            "chapter_id": str(chapter["id"]),
            "chapter_title": str(chapter["title"]),
            "knowledge_points": [
                {
                    "id": str(knowledge_points_by_id[item]["id"]),
                    "title": str(knowledge_points_by_id[item]["title"]),
                }
                for item in knowledge_point_ids
            ],
        }

    @classmethod
    def _registered_knowledge_point_ids(cls) -> set[str]:
        return {
            str(knowledge_point["id"])
            for course in REGISTERED_COURSE_CATALOG
            for chapter in course["chapters"]
            for knowledge_point in chapter["knowledge_points"]
        }

    @staticmethod
    def _task_course_snapshot(course_context: dict[str, Any]) -> dict[str, Any]:
        """去掉可变的 updated_at，确保当天任务保存的是选择时的内容快照。"""

        return {
            "course_id": str(course_context["course_id"]),
            "subject": str(course_context["subject"]),
            "textbook_version": str(course_context["textbook_version"]),
            "grade": int(course_context["grade"]),
            "semester": str(course_context["semester"]),
            "chapter_id": str(course_context["chapter_id"]),
            "chapter_title": str(course_context["chapter_title"]),
            "knowledge_points": [
                {"id": str(item["id"]), "title": str(item["title"])}
                for item in course_context["knowledge_points"]
            ],
        }

    @staticmethod
    def _task_snapshot_knowledge_point_ids(task: dict[str, Any]) -> set[str] | None:
        """`None` 仅表示迁移前没有快照的旧任务；损坏快照会安全地拒绝所有题目。"""

        course_context = task.get("course_context")
        if course_context is None:
            return None
        if not isinstance(course_context, dict):
            return set()
        knowledge_points = course_context.get("knowledge_points")
        if not isinstance(knowledge_points, list) or not knowledge_points:
            return set()
        knowledge_point_ids = {
            item.get("id")
            for item in knowledge_points
            if isinstance(item, dict) and isinstance(item.get("id"), str)
        }
        if len(knowledge_point_ids) != len(knowledge_points):
            return set()
        return {str(item) for item in knowledge_point_ids}

    def _ensure_today_tasks(self, user_id: int, task_date: str) -> None:
        self.repository.ensure_daily_tasks(
            user_id=user_id,
            task_date=task_date,
            tasks=[
                {
                    "id": template.id,
                    "subject": template.subject,
                    "title": template.title,
                    "objective": template.objective,
                    "learning_href": template.learning_href,
                    "growth_earned": template.growth_earned,
                }
                for template in DAILY_TASK_TEMPLATES if is_subject_enabled(template.subject)
            ],
        )

    def _prepare_today_tasks(
        self,
        *,
        user_id: int,
        task_date: str,
    ) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
        """仅在没有旧任务快照时要求选课；迁移前已开始/完成的任务继续可用。"""

        existing_tasks = self.repository.list_daily_tasks(user_id, task_date)
        course_context = self._get_course_context_for_user_id(user_id)
        if not existing_tasks:
            if course_context is None:
                raise CourseContextRequiredError()
            self._ensure_today_tasks_for_course_context(
                user_id=user_id,
                task_date=task_date,
                course_context=course_context,
            )
        elif course_context is not None:
            # 仅尚未开始的任务可随新的课程选择刷新；已开始或已完成行由仓储条件保护。
            self._ensure_today_tasks_for_course_context(
                user_id=user_id,
                task_date=task_date,
                course_context=course_context,
            )
        return self.repository.list_daily_tasks(user_id, task_date), course_context

    def _ensure_today_tasks_for_course_context(
        self,
        *,
        user_id: int,
        task_date: str,
        course_context: dict[str, Any],
    ) -> None:
        selected_titles = "、".join(
            str(item["title"]) for item in course_context["knowledge_points"]
        )
        course_task_snapshot = self._task_course_snapshot(course_context)
        tasks: list[dict[str, Any]] = []
        for template in DAILY_TASK_TEMPLATES:
            if not is_subject_enabled(template.subject):
                continue
            if template.id == "math-shapes-diagnosis":
                tasks.append(
                    {
                        "id": template.id,
                        "subject": course_context["subject"],
                        # 保持既有任务标题，具体章节和知识点由 course_context 快照明确表达。
                        "title": template.title,
                        "objective": f"围绕已选择的“{selected_titles}”完成课堂诊断，找出需要巩固的知识点。",
                        "learning_href": template.learning_href,
                        "growth_earned": template.growth_earned,
                        "course_context": course_task_snapshot,
                    }
                )
            else:
                # 这些是现有通用学习活动，不存在可核验的教材映射，因此明确不附课程快照。
                tasks.append(
                    {
                        "id": template.id,
                        "subject": template.subject,
                        "title": template.title,
                        "objective": template.objective,
                        "learning_href": template.learning_href,
                        "growth_earned": template.growth_earned,
                    }
                )
        self.repository.ensure_daily_tasks(
            user_id=user_id,
            task_date=task_date,
            tasks=tasks,
        )

    def _require_task_prerequisites(
        self,
        *,
        user_id: int,
        task_date: str,
        task_id: str,
    ) -> None:
        """在服务端重复执行每日路线的前序约束，不能只依赖前端锁定按钮。"""

        if task_id in LANGUAGE_TASKS:
            return
        template_ids = [template.id for template in DAILY_TASK_TEMPLATES]
        try:
            task_index = template_ids.index(task_id)
        except ValueError as error:
            raise ResourceNotFoundError("今天没有这项学习任务") from error

        tasks_by_id = {
            str(task["task_id"]): task
            for task in self.repository.list_daily_tasks(user_id, task_date)
        }
        for prerequisite_id in template_ids[:task_index]:
            prerequisite = tasks_by_id.get(prerequisite_id)
            if prerequisite is None or prerequisite.get("status") != "completed":
                raise ResourceConflictError("请先完成前一项学习，再进入下一项")

    def _validate_task_completion_evidence(
        self,
        *,
        user_id: int,
        task_id: str,
        reflection: str,
        evidence: dict[str, Any],
        allowed_knowledge_point_ids: set[str] | None = None,
    ) -> None:
        """验证任务专属完成证据，避免任意一句反思直接获得成长值。"""

        if task_id in LANGUAGE_TASKS:
            _, unit = LANGUAGE_TASKS[task_id]
            try:
                validate_language_evidence(unit, evidence, reflection)
            except ValueError as error:
                raise StudentWorkspaceError(str(error)) from error
            return

        if task_id == "math-shapes-diagnosis":
            attempts = evidence.get("attempts")
            if evidence.get("kind") != "math_diagnosis" or not isinstance(attempts, list):
                raise StudentWorkspaceError("数学课堂诊断需要提交完整作答记录")

            submitted_question_ids: set[str] = set()
            correct_count = 0
            for attempt in attempts:
                if not isinstance(attempt, dict):
                    raise StudentWorkspaceError("数学作答记录格式无效，请重新完成诊断")
                question_id = attempt.get("question_id")
                canonical_question_id = self._canonical_math_question_id(question_id)
                if (
                    not isinstance(question_id, str)
                    or canonical_question_id in submitted_question_ids
                ):
                    raise StudentWorkspaceError("数学作答记录重复或无效，请重新完成诊断")
                if (
                    allowed_knowledge_point_ids is not None
                    and self._math_question_knowledge_point_id(user_id, question_id)
                    not in allowed_knowledge_point_ids
                ):
                    raise StudentWorkspaceError("本次诊断只能提交当前课程已选知识点的题目")
                submitted_question_ids.add(canonical_question_id)
                if self._is_trusted_math_answer(user_id, question_id, attempt.get("answer")):
                    correct_count += 1

            question_count = len(submitted_question_ids)
            if question_count < 10 or (correct_count / question_count) < 0.98:
                raise StudentWorkspaceError("数学课堂诊断需完成至少 10 题，并达到 98 分后才能完成")
            if len(reflection) < 8:
                raise StudentWorkspaceError("数学课堂诊断请至少写 8 个字的学习反思")
            return

        rule = GUIDED_TASK_COMPLETION_RULES.get(task_id)
        if rule is None:
            raise ResourceNotFoundError("今天没有这项学习任务")
        if evidence.get("kind") != "guided_activity":
            raise StudentWorkspaceError("请先完成本任务的自测，再提交学习记录")

        submitted_answers = evidence.get("answers")
        expected_answers = rule["answers"]
        if not isinstance(submitted_answers, dict) or set(submitted_answers) != set(expected_answers):
            raise StudentWorkspaceError("自测作答不完整，请完成全部题目后再提交")

        correct_count = sum(
            submitted_answers.get(question_id) == answer
            for question_id, answer in expected_answers.items()
        )
        if correct_count < rule["minimum_correct_count"]:
            raise StudentWorkspaceError(
                f"本任务至少答对 {rule['minimum_correct_count']} 题后才能完成，请再复习后重试"
            )
        if len(reflection) < rule["reflection_min_length"]:
            raise StudentWorkspaceError(
                f"学习反思至少需要 {rule['reflection_min_length']} 个字"
            )

    def _is_trusted_math_answer(self, user_id: int, question_id: str, answer: Any) -> bool:
        """以静态题库或当前学生已登记的 AI 变式答案重新判定作答。"""

        expected_answer = MATH_DIAGNOSIS_ANSWER_KEY.get(question_id)
        if expected_answer is None:
            expected_answer = MATH_TEXT_FALLBACK_ANSWER_KEY.get(question_id)
        if expected_answer is None and question_id.startswith("ai-"):
            expected_answer = self.repository.get_math_variant_answer(
                user_id=user_id,
                question_id=question_id,
            )
        if expected_answer is None:
            return False
        return StudentWorkspaceService._canonical_math_answer(expected_answer) == (
            StudentWorkspaceService._canonical_math_answer(answer)
        )

    def _math_question_knowledge_point_id(self, user_id: int, question_id: str) -> str | None:
        """由服务端题库或学生私有变式登记确定题目归属，浏览器不能自行声明。"""

        if question_id in ADDITIONAL_QUESTIONS:
            return ADDITIONAL_QUESTIONS[question_id]["knowledgePointId"]
        for prefix, knowledge_point_id in MATH_QUESTION_KNOWLEDGE_POINT_PREFIXES:
            if question_id.startswith(prefix):
                return knowledge_point_id
        if not question_id.startswith("ai-"):
            return None
        record = self.repository.get_math_variant_answer_record(
            user_id=user_id,
            question_id=question_id,
        )
        knowledge_point_id = record.get("knowledge_point_id") if record is not None else None
        return knowledge_point_id if isinstance(knowledge_point_id, str) else None

    @staticmethod
    def _canonical_math_question_id(question_id: Any) -> str | None:
        """把同一题的图形版和文字备用版视为一次作答。"""

        if not isinstance(question_id, str):
            return None
        if question_id in MATH_TEXT_FALLBACK_ANSWER_KEY:
            return question_id.removesuffix("-text-fallback")
        return question_id

    @classmethod
    def _login_attempt_key(cls, username: str) -> str:
        return username.casefold()

    @classmethod
    def _require_login_attempt_allowed(cls, username: str) -> None:
        """超过失败阈值时拒绝请求，并告知客户端可重试的最短等待时间。"""

        now = time.monotonic()
        key = cls._login_attempt_key(username)
        with cls._login_attempt_lock:
            recent_attempts = [
                attempted_at
                for attempted_at in cls._failed_login_attempts.get(key, [])
                if now - attempted_at < cls._login_failure_window_seconds
            ]
            if recent_attempts:
                cls._failed_login_attempts[key] = recent_attempts
            else:
                cls._failed_login_attempts.pop(key, None)
            if len(recent_attempts) < cls._maximum_login_failures:
                return
            retry_after = max(
                1,
                int(cls._login_failure_window_seconds - (now - recent_attempts[0])) + 1,
            )
        raise AuthenticationRateLimitError(retry_after)

    @classmethod
    def _record_failed_login(cls, username: str) -> None:
        now = time.monotonic()
        key = cls._login_attempt_key(username)
        with cls._login_attempt_lock:
            recent_attempts = [
                attempted_at
                for attempted_at in cls._failed_login_attempts.get(key, [])
                if now - attempted_at < cls._login_failure_window_seconds
            ]
            recent_attempts.append(now)
            cls._failed_login_attempts[key] = recent_attempts

    @classmethod
    def _clear_failed_logins(cls, username: str) -> None:
        with cls._login_attempt_lock:
            cls._failed_login_attempts.pop(cls._login_attempt_key(username), None)

    @classmethod
    def _clear_login_attempts_for_testing(cls) -> None:
        """测试之间清理进程内节流记录，避免相互污染。"""

        with cls._login_attempt_lock:
            cls._failed_login_attempts.clear()

    @classmethod
    def _require_registration_allowed(cls, client_host: str) -> None:
        """按可信连接来源限制公开注册；成功、失败尝试都计数，状态始终有界。"""

        now = time.monotonic()
        with cls._registration_attempt_lock:
            for source, attempts in list(cls._registration_attempts.items()):
                recent = [
                    attempted_at for attempted_at in attempts
                    if now - attempted_at < cls._registration_window_seconds
                ]
                if recent:
                    cls._registration_attempts[source] = recent
                else:
                    del cls._registration_attempts[source]

            recent = cls._registration_attempts.get(client_host, [])
            if len(recent) >= cls._maximum_registration_attempts:
                retry_after = cls._registration_window_seconds - (now - recent[0])
                raise RegistrationRateLimitError(max(1, int(retry_after) + 1))
            if not recent and len(cls._registration_attempts) >= cls._maximum_registration_sources:
                # 等到至少一个来源的所有记录过期后，才释放一个新来源位置。
                first_expiry = min(attempts[-1] for attempts in cls._registration_attempts.values())
                retry_after = cls._registration_window_seconds - (now - first_expiry)
                raise RegistrationRateLimitError(max(1, int(retry_after) + 1))
            recent.append(now)
            cls._registration_attempts[client_host] = recent

    @classmethod
    def _clear_registration_attempts_for_testing(cls) -> None:
        """测试之间清理注册限流状态，不影响登录失败和 AI 调用计数。"""

        with cls._registration_attempt_lock:
            cls._registration_attempts.clear()

    @classmethod
    def _require_ai_request_allowed(cls, *, user_id: int, capability: str) -> None:
        """滑动窗口限流：同一学生的不同 AI 能力互不影响。"""

        rate_limit = cls._ai_rate_limits.get(capability)
        if rate_limit is None:
            # 这是服务端编程错误，不把内部能力命名暴露给浏览器。
            raise StudentWorkspaceError("AI 功能配置无效，请稍后重试")
        window_seconds, maximum_requests = rate_limit
        now = time.monotonic()
        key = (user_id, capability)
        with cls._ai_request_lock:
            recent_attempts = [
                attempted_at
                for attempted_at in cls._ai_request_attempts.get(key, [])
                if now - attempted_at < window_seconds
            ]
            if len(recent_attempts) >= maximum_requests:
                retry_after = max(
                    1,
                    int(window_seconds - (now - recent_attempts[0])) + 1,
                )
                cls._ai_request_attempts[key] = recent_attempts
                raise AIRequestRateLimitError(retry_after)
            recent_attempts.append(now)
            cls._ai_request_attempts[key] = recent_attempts

    @classmethod
    def _clear_ai_request_limits_for_testing(cls) -> None:
        """测试之间清理进程内 AI 调用记录，避免账户额度相互污染。"""

        with cls._ai_request_lock:
            cls._ai_request_attempts.clear()

    @staticmethod
    def _canonical_math_answer(answer: Any) -> tuple[Any, ...] | None:
        if isinstance(answer, str):
            return ("single", answer)
        if isinstance(answer, list) and all(isinstance(item, str) for item in answer):
            return ("multiple", *sorted(answer))
        if isinstance(answer, dict) and set(answer) in ({"challengeId", "passed"}, {"challenge_id", "passed"}):
            # Pydantic 的服务端模型使用 challenge_id，而前端互动组件使用 challengeId。
            # 两者只在这里归一化，避免把接口字段差异变成判分漏洞。
            challenge_id = answer.get("challengeId", answer.get("challenge_id"))
            passed = answer.get("passed")
            if isinstance(challenge_id, str) and isinstance(passed, bool):
                return ("interactive", challenge_id, passed)
        return None

    def _create_authenticated_response(self, user: dict[str, Any]) -> dict[str, Any]:
        access_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=self.session_ttl_hours)
        self.repository.create_session(
            user_id=int(user["id"]),
            token_hash=self._hash_token(access_token),
            expires_at=expires_at.isoformat(),
            auth_version=int(user.get("auth_version", 1)),
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_at": expires_at.isoformat(),
            "user": self._public_user(user),
        }

    @staticmethod
    def _public_user(user: dict[str, Any]) -> dict[str, Any]:
        ai_access_mode = "managed"
        if user["role"] == "student":
            if "created_by" in user:
                ai_access_mode = "personal" if user["created_by"] is None else "managed"
            elif user.get("ai_access_mode") == "personal":
                # /me/profile 会再次序列化已认证的公开资料，保留服务端生成的来源。
                ai_access_mode = "personal"
        return {
            "id": int(user["id"]),
            "username": str(user["username"]),
            "display_name": str(user["display_name"]),
            "role": str(user["role"]),
            "grade": user.get("grade"),
            "ai_access_mode": ai_access_mode,
        }

    @staticmethod
    def _public_task(task: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(task["task_id"]),
            "subject": str(task["subject"]),
            "title": str(task["title"]),
            "objective": str(task["objective"]),
            "learning_href": str(task["learning_href"]),
            "growth_earned": int(task["growth_earned"]),
            "status": str(task["status"]),
            "started_at": task.get("started_at"),
            "completed_at": task.get("completed_at"),
            "reflection": task.get("reflection"),
            "course_context": task.get("course_context"),
        }

    @staticmethod
    def _public_wrong_question(question: dict[str, Any]) -> dict[str, Any]:
        """仅输出学生可见的错题字段，避免把归属 ID 或图片数据返回客户端。"""

        analysis_status = str(question.get("analysis_status") or "not_requested")
        if analysis_status not in {"not_requested", "completed"}:
            analysis_status = "not_requested"
        return {
            "id": int(question["id"]),
            "subject": str(question["subject"]),
            "question_text": str(question["question_text"]),
            "knowledge_points": list(question.get("knowledge_points") or []),
            "error_reason": question.get("error_reason"),
            "analysis_summary": question.get("analysis_summary"),
            "analysis_status": analysis_status,
            "has_image": bool(question.get("has_image", False)),
            "created_at": str(question["created_at"]),
            "updated_at": str(question["updated_at"]),
        }

    @staticmethod
    def _validated_cached_ocr_result(raw_result: Any) -> dict[str, Any] | None:
        """只复用仍符合当前 OCR 公开契约的历史结果，避免坏数据造成响应异常。"""

        if not isinstance(raw_result, dict):
            return None
        question_text = raw_result.get("question_text")
        formulas = raw_result.get("formulas")
        diagram_description = raw_result.get("diagram_description")
        model_name = raw_result.get("model_name")
        latency_ms = raw_result.get("latency_ms")
        if (
            not isinstance(question_text, str)
            or not question_text.strip()
            or len(question_text.strip()) > 4_000
            or not isinstance(formulas, list)
            or len(formulas) > 24
            or any(not isinstance(item, str) or not item.strip() or len(item.strip()) > 500 for item in formulas)
            or (
                diagram_description is not None
                and (
                    not isinstance(diagram_description, str)
                    or len(diagram_description.strip()) > 2_000
                )
            )
            or not isinstance(model_name, str)
            or not model_name.strip()
            or len(model_name.strip()) > 255
            or type(latency_ms) is not int
            or latency_ms < 0
        ):
            return None
        return {
            "question_text": question_text.strip(),
            "formulas": [item.strip() for item in formulas],
            "diagram_description": (
                diagram_description.strip()
                if isinstance(diagram_description, str) and diagram_description.strip()
                else None
            ),
            "model_name": model_name.strip(),
            "latency_ms": latency_ms,
        }

    @staticmethod
    def _validate_wrong_question_subject(subject: str) -> str:
        if not isinstance(subject, str):
            raise StudentWorkspaceError("学科格式无效")
        cleaned = subject.strip()
        if not cleaned or len(cleaned) > 24:
            raise StudentWorkspaceError("请填写 1 至 24 个字符的学科名称")
        return cleaned

    @staticmethod
    def _validate_wrong_question_text(question_text: str) -> str:
        if not isinstance(question_text, str):
            raise StudentWorkspaceError("题干格式无效")
        cleaned = question_text.strip()
        if not cleaned:
            raise StudentWorkspaceError("请确认并填写题目内容后再加入错题集")
        if len(cleaned) > 4_000:
            raise StudentWorkspaceError("题目内容不能超过 4000 个字符")
        return cleaned

    @staticmethod
    def _normalize_knowledge_points(knowledge_points: list[str]) -> list[str]:
        if not isinstance(knowledge_points, list) or len(knowledge_points) > 20:
            raise StudentWorkspaceError("知识点格式无效")
        normalized: list[str] = []
        for item in knowledge_points:
            if not isinstance(item, str):
                raise StudentWorkspaceError("知识点格式无效")
            cleaned = item.strip()
            if not cleaned or len(cleaned) > 80:
                raise StudentWorkspaceError("每个知识点需为 1 至 80 个字符")
            if cleaned not in normalized:
                normalized.append(cleaned)
        return normalized

    @staticmethod
    def _matches_image_signature(media_type: str, image_data: bytes) -> bool:
        """在无额外图片库的前提下校验常见图片格式的固定文件签名。"""

        if media_type == "image/jpeg":
            return image_data.startswith(b"\xff\xd8\xff")
        if media_type == "image/png":
            return image_data.startswith(b"\x89PNG\r\n\x1a\n")
        if media_type == "image/webp":
            return len(image_data) >= 12 and image_data[:4] == b"RIFF" and image_data[8:12] == b"WEBP"
        return False

    @classmethod
    def _validate_username(cls, username: str) -> str:
        cleaned = username.strip()
        if not 3 <= len(cleaned) <= 64 or cls._username_whitespace.search(cleaned):
            raise StudentWorkspaceError("账号需为 3 至 64 个非空白字符")
        return cleaned

    @staticmethod
    def _validate_password(password: str) -> str:
        if len(password) < 8 or len(password) > 256:
            raise StudentWorkspaceError("密码长度需为 8 至 256 个字符")
        return password

    @staticmethod
    def _validate_display_name(display_name: str) -> str:
        cleaned = display_name.strip()
        if not cleaned or len(cleaned) > 40:
            raise StudentWorkspaceError("姓名需为 1 至 40 个字符")
        return cleaned

    @staticmethod
    def _normalize_optional_text(
        value: str | None,
        field_name: str,
        max_length: int,
    ) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) > max_length:
            raise StudentWorkspaceError(f"{field_name}不能超过 {max_length} 个字符")
        return cleaned or None

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        n, r, p = 16_384, 8, 1
        password_hash = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=n,
            r=r,
            p=p,
            dklen=64,
        )
        return f"scrypt${n}${r}${p}${salt.hex()}${password_hash.hex()}"

    @staticmethod
    def _verify_password(password: str, stored_hash: str) -> bool:
        try:
            algorithm, n_text, r_text, p_text, salt_text, digest_text = stored_hash.split("$")
            if algorithm != "scrypt":
                return False
            expected = bytes.fromhex(digest_text)
            candidate = hashlib.scrypt(
                password.encode("utf-8"),
                salt=bytes.fromhex(salt_text),
                n=int(n_text),
                r=int(r_text),
                p=int(p_text),
                dklen=len(expected),
            )
            return hmac.compare_digest(candidate, expected)
        except (TypeError, ValueError):
            return False

    @staticmethod
    def _hash_token(access_token: str) -> str:
        return hashlib.sha256(access_token.encode("utf-8")).hexdigest()

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _today() -> str:
        return date.today().isoformat()
