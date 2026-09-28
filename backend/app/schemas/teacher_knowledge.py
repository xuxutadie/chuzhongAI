"""知识库输入契约；拒绝请求夹带归属或未知字段。

配置依据：https://docs.pydantic.dev/latest/concepts/models/#extra-data
"""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)


class SourceRef(StrictModel):
    file_id: str
    kind: Literal['page','paragraph']
    index: int = Field(ge=1)
    region: list[float] | None = None

    @model_validator(mode='after')
    def valid_region(self):
        if self.region is not None:
            r = self.region
            if len(r) != 4 or not all(0 <= x <= 1 for x in r) or r[0] >= r[2] or r[1] >= r[3]:
                raise ValueError('选区必须为有效归一化矩形')
        return self


class CourseScope(StrictModel):
    grade: str = ''
    edition: str = ''
    semester: str = ''
    chapter_version_ids: list[str] = Field(default_factory=list,max_length=50)
    knowledge_point_ids: list[str] = Field(default_factory=list,max_length=100)
    prerequisite_ids: list[str] = Field(default_factory=list,max_length=100)


class ChapterInput(StrictModel):
    title:str=Field(min_length=1,max_length=200)
    chapter_id:str|None=None
    sources:list[SourceRef]=Field(default_factory=list,max_length=50)
    knowledge_point_ids:list[str]=Field(default_factory=list,max_length=100)
    prerequisite_ids:list[str]=Field(default_factory=list,max_length=100)
    notes:str=Field(default='',max_length=15000)


class QuestionInput(StrictModel):
    prompt: str = Field(default='',max_length=15000)
    response_type: Literal['single','multiple','boolean','short','worked'] = 'short'
    options: list[dict] = Field(default_factory=list,max_length=12)
    answer: dict = Field(default_factory=dict)
    explanation: str = Field(default='',max_length=15000)
    rubric: list[dict] = Field(default_factory=list,max_length=30)
    asset_ids: list[str] = Field(default_factory=list,max_length=20)
    needs_figure: bool = False
    scope: CourseScope = Field(default_factory=CourseScope)
    difficulty: Literal['regular','advanced','challenge'] = 'regular'
    sources: list[SourceRef] = Field(default_factory=list,max_length=30)


class GenerationRequest(StrictModel):
    request_id: str = Field(min_length=1,max_length=100)
    scope: CourseScope = Field(default_factory=CourseScope)
    difficulty: Literal['regular','advanced','challenge'] = 'regular'
    response_type: Literal['single','multiple','boolean','short','worked'] = 'short'
    original_count: int = Field(default=0,ge=0,le=50)
    variant_count: int = Field(default=1,ge=0,le=50)
    reference_version_ids: list[str] = Field(default_factory=list,max_length=50)
    allow_ai_fill: bool = False
    purpose: Literal['test','practice'] = 'practice'

    @model_validator(mode='after')
    def valid_total(self):
        if not 1 <= self.original_count + self.variant_count <= 50:
            raise ValueError('每次生成 1—50 道题')
        return self
