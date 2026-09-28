from enum import StrEnum

from fastapi import Header, HTTPException, status


class Role(StrEnum):
    student = "student"
    parent = "parent"
    coach = "coach"
    admin = "admin"
    teacher = "teacher"


def require_roles(*allowed_roles: Role):
    def dependency(x_user_role: str = Header(default=Role.student.value)) -> Role:
        try:
            role = Role(x_user_role)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="用户角色无效"
            ) from exc

        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="当前角色无权访问该资源"
            )

        return role

    return dependency
