from typing import Protocol


class LLMGateway(Protocol):
    """大模型接口协议，后续可替换为不同模型厂商实现。"""

    def generate(self, prompt: str) -> str:
        """根据提示词生成文本。"""


class PlaceholderLLMGateway:
    def generate(self, prompt: str) -> str:
        raise NotImplementedError("第一阶段仅预留大模型接口，不调用真实模型")

