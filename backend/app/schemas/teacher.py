"""教师端只接受明确字段，禁止客户端指定角色或学生归属。"""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from app.schemas.student_workspace import AccountCredentials

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
School = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class TeacherProfileInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    school_name: School
    teaching_classes: list[Name] = Field(min_length=1, max_length=20)


class TeacherRegister(AccountCredentials, TeacherProfileInput):
    model_config = ConfigDict(extra='forbid')
    display_name: Name


class TeacherProfile(BaseModel):
    user_id: int
    display_name: str
    school_name: str
    teaching_classes: list[str]


class ClaimRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    code: str = Field(min_length=1, max_length=40)
    request_id: str = Field(min_length=1, max_length=100)


class ClaimReceipt(BaseModel):
    link_id: int
    student_id: int
    linked_at: str


class ClaimCode(BaseModel):
    code: str
    expires_at: str


class StudentTeacherLink(BaseModel):
    link_id: int
    teacher_id: int
    display_name: str
    school_name: str
    linked_at: str
    source: str


class StudentSummary(BaseModel):
    id: int
    link_id: int
    linked_at: str
    display_name: str
    school_name: str
    class_name: str
    grade: str
    last_activity: str | None


class StudentList(BaseModel):
    items: list[StudentSummary]
    total: int


class AssessmentSummary(BaseModel):
    id: str
    status: Literal['active', 'submitted']
    created_at: str
    submitted_at: str | None
    score: float | None
    priority: list[str]
    report_available: bool = False
    report_notice: str | None = None


class LearningStep(BaseModel):
    step: int
    status: str


class LearningDay(BaseModel):
    date: str
    steps: list[LearningStep]
    updated_at: str


class StudentProfileView(BaseModel):
    display_name: str
    fields: dict


class StudentOverview(BaseModel):
    student_id: int
    link_id: int
    profile: StudentProfileView
    latest_assessment: AssessmentSummary | None
    today: LearningDay | None
    last_activity: str | None


class InsightHistory(BaseModel):
    items: list[dict]
    total: int


class AssessmentDetail(AssessmentSummary):
    profile: dict | None = None
    report: dict | None = None
    version: str | None = None


class WrongDetail(BaseModel):
    id: int
    question_text: str
    knowledge_points: list[str]
    error_reason: str | None
    analysis_summary: str | None
    analysis_status: str
    created_at: str
    updated_at: str
    has_image: bool
    question: dict
    events: list[dict]
    stage: str
    analysis: dict | None = None
    analysis_stale: bool = False
