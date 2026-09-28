"""学生个人 AI 配置的输入和脱敏状态；任何响应都不包含密钥。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator


class PersonalAIConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: StrictBool
    provider: str = Field(min_length=1, max_length=40)
    api_base_url: str = Field(min_length=1, max_length=500)
    model: str = Field(min_length=1, max_length=255)
    api_key: str | None = Field(default=None, max_length=512, repr=False)

    @field_validator("provider", "api_base_url", "model", "api_key")
    @classmethod
    def reject_control_characters(cls, value: str | None) -> str | None:
        if value is not None and any(ord(character) < 32 or ord(character) == 127 for character in value):
            raise ValueError("配置内容不能包含控制字符")
        return value


class PersonalAIProviderStatus(BaseModel):
    enabled: bool
    configured: bool
    provider: str | None
    model: str | None
    api_base_url: str | None
    has_api_key: bool


class PersonalAIProviderOption(BaseModel):
    provider: str
    api_base_url: str


class PersonalAIConfigStatus(BaseModel):
    mode: Literal["personal", "managed"]
    storage: Literal["windows_dpapi", "unavailable"]
    llm: PersonalAIProviderStatus
    ocr: PersonalAIProviderStatus
    providers: list[PersonalAIProviderOption]
