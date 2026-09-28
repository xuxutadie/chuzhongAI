"""管理员错误使用现有安全 JSON 异常出口。"""
from app.services.student_workspace_service import StudentWorkspaceError


class AdminError(StudentWorkspaceError):
    def __init__(self, message, status_code=422):
        super().__init__(message)
        self.status_code = status_code
