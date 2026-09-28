"""限制可提交字段，学校身份和授权范围不可由客户端扩权。"""
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError
from .errors import EducationError


class Request(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    request_id: UUID


class CreateSpace(Request):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal['school', 'institution', 'independent']


class MemberInvite(Request):
    space_id: UUID
    target_id: int = Field(gt=0, strict=True)
    role: Literal['school_admin', 'teacher', 'student']


class AcceptInvite(Request):
    token: str = Field(min_length=20, max_length=128)


class StateChange(Request):
    expected_revision: int = Field(ge=1, strict=True)
    state: Literal['active', 'disabled']


class HistoryInvite(Request):
    student_id: int = Field(gt=0, strict=True)


class MemberRoleChange(Request):
    expected_revision: int = Field(ge=1, strict=True)
    role: Literal['school_admin', 'teacher', 'student']


class ConfirmHistory(AcceptInvite):
    consent: StrictBool


class RevokeGrant(Request):
    expected_revision: int = Field(ge=1, strict=True)


def validated(model, payload):
    try:
        return model.model_validate(payload).model_dump(mode='json')
    except ValidationError:
        raise EducationError('提交内容格式不正确，请检查后重试', 422) from None
