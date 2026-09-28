from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ProfileFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    nickname: str = Field(default="", max_length=40)
    grade: str = Field(default="", max_length=24)
    school_name: str = Field(default="", max_length=100)
    class_name: str = Field(default="", max_length=40)
    textbook: str = Field(default="", max_length=100)
    exam_score: float | None = Field(default=None, ge=0, le=1000)
    exam_total: float | None = Field(default=None, gt=0, le=1000)
    exam_date: str = Field(default="", max_length=80)
    weak_topics: str = Field(default="", max_length=400)
    goal: str = Field(default="", max_length=400)
    daily_minutes: int | None = Field(default=None, ge=5, le=180)
    learning_details: dict[Annotated[str, Field(max_length=40)], Annotated[str, Field(max_length=400)]] = Field(default_factory=dict, max_length=18)
    answered_fields: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=24)

    @model_validator(mode="after")
    def validate_score(self):
        if self.exam_score is not None and (self.exam_total is None or self.exam_score > self.exam_total):
            raise ValueError("填写考试成绩时，请同时填写满分，且得分不能大于满分。")
        return self


class ProfileSave(BaseModel):
    revision: int = Field(ge=0)
    fields: ProfileFields
    confirmed: bool = False


class SchoolSave(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    revision: int = Field(ge=0)
    school_name: str = Field(min_length=1, max_length=100)
    class_name: str = Field(min_length=1, max_length=40)


class AnswerSave(BaseModel):
    revision: int = Field(ge=0)
    answers: dict[str, Literal["A", "B", "C", "D"] | None] = Field(max_length=24)
    times: dict[str, int] = Field(default_factory=dict, max_length=24)


class SubmitRequest(BaseModel):
    revision: int = Field(ge=0)


class StartRequest(BaseModel):
    retest: bool = False


class InterviewQuestion(BaseModel):
    field: str = Field(min_length=1, max_length=40)
