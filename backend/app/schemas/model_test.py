from typing import Literal

from pydantic import BaseModel, Field


ModelProvider = Literal["通义千问", "豆包", "DeepSeek", "OpenAI", "腾讯混元", "自定义兼容接口"]


class ModelConnectionTestRequest(BaseModel):
    """管理员本地测试模型连通性时提交的临时凭据。"""

    provider: ModelProvider
    api_key: str = Field(min_length=8, max_length=512)
    model_name: str = Field(min_length=1, max_length=255)
    api_base_url: str | None = Field(default=None, max_length=500)


class ModelConnectionTestResponse(BaseModel):
    provider: ModelProvider
    model_name: str
    reply: str
    latency_ms: int = Field(ge=0)
    test_session_id: str = Field(min_length=20, max_length=255)


class AssistantTestRequest(BaseModel):
    """本地管理员在教师式答疑中提交的临时测试问题。"""

    question: str = Field(min_length=1, max_length=2000)


class AssistantTestResponse(BaseModel):
    model_name: str
    reply: str
    latency_ms: int = Field(ge=0)
