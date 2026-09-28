from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


KnowledgePointId = Literal[
    "g7u-shapes-solid",
    "g7u-shapes-folding",
    "g7u-shapes-section",
    "g7u-shapes-views",
]
MathDifficulty = Literal["basic", "advanced", "challenge"]
MathResponseType = Literal["single-choice", "true-false", "multi-choice", "interactive"]
VisualKind = Literal["solid-model", "folding-net", "cross-section", "orthographic-view"]


class MathQuestionGenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    knowledge_point_id: KnowledgePointId
    capability_tag: str = Field(min_length=1, max_length=100)
    difficulty: MathDifficulty
    response_type: MathResponseType
    excluded_question_ids: list[str] = Field(default_factory=list, max_length=100)
    weakness_reason: str = Field(default="", max_length=500)


class MathQuestionOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=1, max_length=200)


class InteractionExpectedAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    challenge_id: str = Field(min_length=1, max_length=80)
    passed: Literal[True]


class MathVisualSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: VisualKind
    solid: Literal["cube", "cuboid", "cylinder", "cone", "sphere"] | None = None
    net_id: str | None = Field(default=None, min_length=1, max_length=80)
    target_face: str | None = Field(default=None, max_length=20)
    plane_preset: str | None = Field(default=None, min_length=1, max_length=80)
    structure_id: str | None = Field(default=None, min_length=1, max_length=80)
    view: Literal["front", "left", "top"] | None = None

    @model_validator(mode="after")
    def validate_kind_fields(self):
        if self.kind == "solid-model" and self.solid is None:
            raise ValueError("立体模型缺少 solid")
        if self.kind == "folding-net" and self.net_id is None:
            raise ValueError("展开图缺少 net_id")
        if self.kind == "cross-section" and (self.solid is None or self.plane_preset is None):
            raise ValueError("截面图缺少 solid 或 plane_preset")
        if self.kind == "orthographic-view" and (self.structure_id is None or self.view is None):
            raise ValueError("三视图缺少 structure_id 或 view")
        return self


class GeneratedMathQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-zA-Z0-9-]{3,80}$")
    knowledge_point_id: KnowledgePointId
    capability_tag: str = Field(min_length=1, max_length=100)
    difficulty: MathDifficulty
    response_type: MathResponseType
    prompt: str = Field(min_length=4, max_length=800)
    options: list[MathQuestionOption] | None = Field(default=None, max_length=8)
    correct_answer: str | list[str] | InteractionExpectedAnswer
    explanation: str = Field(min_length=4, max_length=1000)
    visual: MathVisualSpec | None = None
    source: Literal["ai-generated"]

    @model_validator(mode="after")
    def validate_answer_and_visual(self):
        option_ids = [option.id for option in self.options or []]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("选项编号不能重复")

        if self.response_type in {"single-choice", "true-false"}:
            if not isinstance(self.correct_answer, str) or self.correct_answer not in option_ids:
                raise ValueError("正确答案必须引用一个已有选项")
        elif self.response_type == "multi-choice":
            if not isinstance(self.correct_answer, list) or not self.correct_answer:
                raise ValueError("多选题答案必须是非空列表")
            if len(self.correct_answer) != len(set(self.correct_answer)):
                raise ValueError("多选题答案不能重复")
            if any(answer not in option_ids for answer in self.correct_answer):
                raise ValueError("多选题答案必须引用已有选项")
        elif not isinstance(self.correct_answer, InteractionExpectedAnswer):
            raise ValueError("互动题必须提供可校验的完成条件")

        if any(marker in self.prompt for marker in ("如下图", "观察图", "看图", "图中")) and self.visual is None:
            raise ValueError("看图题必须提供 visual")
        if self.response_type == "interactive" and self.visual is None:
            raise ValueError("互动题必须提供 visual")
        return self


class MathQuestionGenerationResponse(BaseModel):
    question: GeneratedMathQuestion
    model_name: str
    latency_ms: int = Field(ge=0)
