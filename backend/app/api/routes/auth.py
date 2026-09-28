from fastapi import APIRouter

from app.core.security import Role
from app.schemas.auth import RoleList

router = APIRouter()


@router.get("/roles", response_model=RoleList)
def list_roles() -> RoleList:
    return RoleList(roles=list(Role))
