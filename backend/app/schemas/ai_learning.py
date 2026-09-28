"""AI/OCR、上传错题和服务端变式题的公开接口契约。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.math_question_generation import (
    MathQuestionGenerationRequest,
    MathQuestionOption,
    MathVisualSpec,
)


class IntegrationCapabilityStatus(BaseModel):
    enabled: bool
    configured: bool
    provider: str | None = None
    model: str | None = None


class IntegrationStatusResponse(BaseModel):
    llm: IntegrationCapabilityStatus
    ocr: IntegrationCapabilityStatus


class WrongQuestionUploadResponse(BaseModel):
    upload_id: str = Field(min_length=12, max_length=128)
    media_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(gt=0, le=5 * 1024 * 1024)
    created_at: str


class OCRRecognitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    upload_id: str = Field(min_length=12, max_length=128)


class OCRRecognitionResponse(BaseModel):
    upload_id: str
    question_text: str
    formulas: list[str]
    diagram_description: str | None = None
    model_name: str
    latency_ms: int = Field(ge=0)


class CreateWrongQuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str = Field(min_length=1, max_length=24)
    question_text: str = Field(min_length=1, max_length=4_000)
    knowledge_points: list[str] = Field(default_factory=list, max_length=20)
    error_reason: str | None = Field(default=None, max_length=500)
    source_upload_id: str | None = Field(default=None, min_length=12, max_length=128)


class UpdateWrongQuestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: str | None = Field(default=None, min_length=1, max_length=24)
    question_text: str | None = Field(default=None, min_length=1, max_length=4_000)
    knowledge_points: list[str] | None = Field(default=None, max_length=20)
    error_reason: str | None = Field(default=None, max_length=500)


class WrongQuestionRecord(BaseModel):
    id: int
    subject: str
    question_text: str
    knowledge_points: list[str]
    error_reason: str | None = None
    analysis_summary: str | None = None
    analysis_status: Literal["not_requested", "completed"]
    has_image: bool
    created_at: str
    updated_at: str


class WrongQuestionResponse(BaseModel):
    question: WrongQuestionRecord


class WrongQuestionListResponse(BaseModel):
    questions: list[WrongQuestionRecord]
    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class WrongQuestionAnalysis(BaseModel):
    error_reason: str
    knowledge_points: list[str]
    suggestion: str
    model_name: str
    latency_ms: int = Field(ge=0)


class WrongQuestionAnalysisResponse(BaseModel):
    question: WrongQuestionRecord
    analysis: WrongQuestionAnalysis


class AssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=2_000)


class AssistantResponse(BaseModel):
    model_name: str
    reply: str
    latency_ms: int = Field(ge=0)


class StudentGeneratedMathQuestion(BaseModel):
    """学生端变式题不返回答案或可直接泄题的解析，判分信息只留在服务端。"""

    id: str
    knowledge_point_id: str
    capability_tag: str
    difficulty: str
    response_type: str
    prompt: str
    options: list[MathQuestionOption] | None = None
    visual: MathVisualSpec | None = None
    source: Literal["ai-generated"]


class StudentMathVariantQuestionResponse(BaseModel):
    question: StudentGeneratedMathQuestion
    model_name: str
    latency_ms: int = Field(ge=0)


# 保留显式导入，便于客户端从 OpenAPI 读取这一输入模型。
StudentMathVariantQuestionRequest = MathQuestionGenerationRequest
