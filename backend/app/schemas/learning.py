from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


TaskStatus = Literal["pending", "in_progress", "completed", "cancelled"]
StudyRecordStatus = Literal["in_progress", "completed", "abandoned"]
GrowthSourceType = Literal["task_completion"]


class CompleteTaskRequest(BaseModel):
    """学生完成学习任务时提交的反馈。"""

    duration_minutes: int = Field(ge=0, le=720)
    mastery_level: int = Field(ge=1, le=5)
    student_feedback: str | None = Field(default=None, max_length=1000)


class LearningTaskResponse(BaseModel):
    id: UUID
    student_id: UUID
    subject: Literal["chinese", "math", "english"]
    title: str
    description: str | None = None
    status: TaskStatus
    due_date: date | None = None
    created_at: datetime
    updated_at: datetime


class StudyRecordResponse(BaseModel):
    id: UUID
    student_id: UUID
    task_id: UUID
    subject: Literal["chinese", "math", "english"]
    status: StudyRecordStatus
    started_at: datetime
    completed_at: datetime | None = None
    duration_minutes: int | None = None
    mastery_level: int | None = None
    student_feedback: str | None = None
    created_at: datetime
    updated_at: datetime


class GrowthRecordResponse(BaseModel):
    id: UUID
    student_id: UUID
    source_type: GrowthSourceType
    source_id: UUID
    delta: int
    reason: str
    created_at: datetime


class StartTaskResponse(BaseModel):
    study_record: StudyRecordResponse


class CompleteTaskResponse(BaseModel):
    task: LearningTaskResponse
    study_record: StudyRecordResponse
    growth_record: GrowthRecordResponse


class StudyRecordListResponse(BaseModel):
    records: list[StudyRecordResponse]


class GrowthRecordListResponse(BaseModel):
    records: list[GrowthRecordResponse]
