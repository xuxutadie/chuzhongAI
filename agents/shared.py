from dataclasses import dataclass, field
from typing import Any, Protocol


class SupportsGenerate(Protocol):
    def generate(self, prompt: str) -> str:
        """生成大模型文本。"""


@dataclass(frozen=True)
class AgentResult:
    """Agent 标准输出，业务层审核后才能保存到数据库。"""

    agent_name: str
    summary: str
    data: dict[str, Any]
    next_actions: list[str] = field(default_factory=list)


def require_fields(payload: dict[str, Any], fields: list[str]) -> None:
    missing = [field_name for field_name in fields if field_name not in payload]
    if missing:
        raise ValueError(f"缺少必要字段：{', '.join(missing)}")


def score_level(score: float | int | None) -> str:
    if score is None:
        return "缺少数据"
    if score >= 85:
        return "优势稳定"
    if score >= 70:
        return "中等可提升"
    if score >= 60:
        return "基础需巩固"
    return "明显薄弱"


def optional_llm_generate(llm_gateway: SupportsGenerate | None, prompt: str) -> str | None:
    """第一阶段允许不接入真实模型；接入后统一通过网关生成。"""

    if llm_gateway is None:
        return None
    return llm_gateway.generate(prompt)
