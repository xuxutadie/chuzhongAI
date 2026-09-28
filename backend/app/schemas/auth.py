from pydantic import BaseModel

from app.core.security import Role


class RoleList(BaseModel):
    roles: list[Role]

