"""管理请求严格白名单，密码不出现在响应中。"""
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

Role = Literal['student','teacher','admin','parent','coach']


class WriteRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    admin_password: str = Field(min_length=1,max_length=256)


class CreateAccount(WriteRequest):
    username: str = Field(min_length=3,max_length=64)
    display_name: str = Field(min_length=1,max_length=40)
    role: Literal['student','teacher','admin']
    password: str = Field(min_length=8,max_length=256)
    grade: str | None = Field(default=None,max_length=24)


class UpdateAccount(WriteRequest):
    expected_revision: int = Field(ge=1)
    username: str = Field(min_length=3,max_length=64)
    display_name: str = Field(min_length=1,max_length=40)
    role: Role
    grade: str | None = Field(default=None,max_length=24)


class StateChange(WriteRequest):
    expected_revision: int = Field(ge=1)
    action: Literal['disable','enable','delete','restore']


class PasswordReset(WriteRequest):
    expected_revision: int = Field(ge=1)
    password: str = Field(min_length=8,max_length=256)


class ViewEvent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    request_id: UUID
    target_id: int = Field(gt=0)
    kind: Literal['student','teacher']


class Account(BaseModel):
    id: int
    username: str
    display_name: str
    role: Role
    grade: str | None
    created_at: str
    state: Literal['active','disabled','deleted']
    revision: int
