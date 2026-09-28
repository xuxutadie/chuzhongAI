"""学生账号与学习工作台接口的数据模型。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AccountCredentials(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class BootstrapAdminRequest(AccountCredentials):
    display_name: str = Field(min_length=1, max_length=40)
    # 本机开发可留空；生产环境由服务器 BOOTSTRAP_SETUP_CODE 校验。
    setup_code: str | None = Field(default=None, max_length=256)


class CreateStudentRequest(AccountCredentials):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=40)
    grade: str | None = Field(default=None, max_length=24)


class RegisterStudentRequest(CreateStudentRequest):
    """公开注册只能提交个人资料，不能指定角色或教师归属。"""

    model_config = ConfigDict(extra="forbid")


class CreateStudentsBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    students: list[CreateStudentRequest] = Field(min_length=1, max_length=50)


class ResetStudentPasswordRequest(BaseModel):
    password: str = Field(min_length=8, max_length=256)


class PublicUser(BaseModel):
    id: int
    username: str
    display_name: str
    role: Literal["admin", "student", "parent", "coach", "teacher"]
    grade: str | None = None
    ai_access_mode: Literal["personal", "managed"] = "managed"


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    expires_at: str
    user: PublicUser


class CurrentUserResponse(BaseModel):
    user: PublicUser


class StudentListResponse(BaseModel):
    students: list[PublicUser]


class CreateStudentResponse(BaseModel):
    user: PublicUser


class WorkspaceStateRequest(BaseModel):
    state: dict[str, Any]


class WorkspaceStateResponse(BaseModel):
    state: dict[str, Any]
    updated_at: str | None = None


class CourseKnowledgePoint(BaseModel):
    """服务端已导入且具备可信题库内容的知识点。"""

    id: str
    title: str


class CourseChapter(BaseModel):
    id: str
    title: str
    knowledge_points: list[CourseKnowledgePoint]


class CourseCatalogEntry(BaseModel):
    id: str
    subject: str
    textbook_version: str
    grade: int
    semester: str
    chapters: list[CourseChapter]


class CourseCatalogResponse(BaseModel):
    courses: list[CourseCatalogEntry]


class CourseContextRequest(BaseModel):
    """学生只提交服务端课程目录中的稳定 ID，展示名称由服务端回填。"""

    course_id: str = Field(min_length=1, max_length=80)
    chapter_id: str = Field(min_length=1, max_length=80)
    knowledge_point_ids: list[str] = Field(min_length=1, max_length=4)


class CourseContextSnapshot(BaseModel):
    """课程选择或当天任务中被冻结的可展示课程内容。"""

    course_id: str
    subject: str
    textbook_version: str
    grade: int
    semester: str
    chapter_id: str
    chapter_title: str
    knowledge_points: list[CourseKnowledgePoint]


class StudentCourseContext(CourseContextSnapshot):
    updated_at: str


class StudentCourseContextResponse(BaseModel):
    context: StudentCourseContext | None = None


class DailyTask(BaseModel):
    id: str
    subject: str
    title: str
    objective: str
    learning_href: str
    growth_earned: int
    status: Literal["not_started", "in_progress", "completed"]
    started_at: str | None = None
    completed_at: str | None = None
    reflection: str | None = None
    # 仅课程关联任务携带当天冻结的课程快照；通用活动不伪装教材映射。
    course_context: CourseContextSnapshot | None = None


class TodayTasksResponse(BaseModel):
    task_date: str
    tasks: list[DailyTask]
    growth_earned: int
    # 当前选择供页面切换课程时展示；具体任务仍以各自 course_context 为准。
    course_context: StudentCourseContext | None = None


class LanguageUnitProgress(BaseModel):
    task_id: str
    last_studied_date: str
    last_completed_at: str | None = None
    completed_count: int = Field(ge=0)


class LanguageProgressResponse(BaseModel):
    units: list[LanguageUnitProgress]


class StartTaskResponse(BaseModel):
    task: DailyTask


class MathAnswerAttemptEvidence(BaseModel):
    question_id: str = Field(min_length=1, max_length=80)
    answer: Any


class TaskCompletionEvidence(BaseModel):
    """页面提交的学习结果；服务端会按任务类型再次校验。"""

    kind: Literal["math_diagnosis", "guided_activity", "language_unit"]
    attempts: list[MathAnswerAttemptEvidence] | None = Field(default=None, max_length=100)
    answers: dict[str, str] | None = None
    diagnosis_answers: dict[str, str] | None = None


class CompleteTodayTaskRequest(BaseModel):
    reflection: str = Field(min_length=1, max_length=1_000)
    evidence: TaskCompletionEvidence


class CompleteTodayTaskResponse(BaseModel):
    task: DailyTask
    was_already_completed: bool


class DetailResponse(BaseModel):
    detail: str


class CourseContextRequiredResponse(DetailResponse):
    course_context_required: Literal[True] = True
