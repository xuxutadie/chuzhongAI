"""只读历史报告的最低完整性检查，不重新评分或改写原始记录。"""
from typing import Literal
from pydantic import BaseModel, ConfigDict


class StoredModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class Distribution(StoredModel):
    correct: int
    wrong: int
    skipped: int


class Dimension(StoredModel):
    name: str
    score: float
    correct: int
    sample_size: int
    skipped: int
    advice: str


class Evidence(StoredModel):
    id: str
    dimension: int
    text: str
    options: dict[str, str]
    stage: str
    difficulty: str
    answer: str
    explanation: str
    chosen: str | None
    state: Literal['correct','wrong','skipped']


class StoredDiagnosisReport(StoredModel):
    score: float
    distribution: Distribution
    dimensions: list[Dimension]
    evidence: list[Evidence]
    priority: list[str]
    interpretation: str | None
    interpretation_mode: str
    notice: str
    version: str
