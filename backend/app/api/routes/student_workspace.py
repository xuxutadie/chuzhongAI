"""学生账户、工作台和每日学习任务 API。"""

from __future__ import annotations

import hmac
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.schemas.student_workspace import (
    AccountCredentials,
    AuthResponse,
    BootstrapAdminRequest,
    CompleteTodayTaskRequest,
    CompleteTodayTaskResponse,
    CourseCatalogResponse,
    CourseContextRequest,
    CourseContextRequiredResponse,
    CreateStudentRequest,
    CreateStudentResponse,
    CreateStudentsBatchRequest,
    CurrentUserResponse,
    DetailResponse,
    LanguageProgressResponse,
    RegisterStudentRequest,
    ResetStudentPasswordRequest,
    StartTaskResponse,
    StudentListResponse,
    StudentCourseContextResponse,
    TodayTasksResponse,
    WorkspaceStateRequest,
    WorkspaceStateResponse,
)
from app.services.student_workspace_service import (
    AuthorizationError,
    StudentWorkspaceService,
)


router = APIRouter()


_bearer_scheme = HTTPBearer(auto_error=False)


def get_student_workspace_service() -> StudentWorkspaceService:
    """创建独立 SQLite 工作台服务，不影响旧 PostgreSQL 学习接口。"""

    repository = StudentWorkspaceRepository(settings.student_workspace_database_file)
    return StudentWorkspaceService(repository, session_ttl_hours=settings.session_ttl_hours)


StudentWorkspaceServiceDependency = Annotated[
    StudentWorkspaceService,
    Depends(get_student_workspace_service),
]


@router.get("/auth/setup-status")
def setup_status(service: StudentWorkspaceServiceDependency):
    # 公开接口只返回初始化是否需要，不返回任何账号资料。
    return {"setup_required": not service.repository.has_admin()}


def get_current_workspace_user(
    service: StudentWorkspaceServiceDependency,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    expected_user_id: str | None = Header(
        default=None,
        alias="X-AI-Coach-Expected-User-Id",
    ),
) -> dict[str, Any]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    current_user = service.get_current_user(credentials.credentials)

    # 多标签页共享 HttpOnly 会话 Cookie 时，较早页面的异步请求可能在新账号登录后才到达。
    # 浏览器/BFF 会附带页面启动时看到的用户 ID；不一致就拒绝，避免旧草稿写入新账号。
    if expected_user_id is not None:
        try:
            expected_user_id_value = int(expected_user_id)
        except (TypeError, ValueError):
            expected_user_id_value = None
        if expected_user_id_value != int(current_user["id"]):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="当前账号已切换，请刷新页面后重试",
                headers={"X-AI-Coach-Session-Context-Changed": "1"},
            )
    return current_user


CurrentWorkspaceUser = Annotated[dict[str, Any], Depends(get_current_workspace_user)]


def require_admin(current_user: CurrentWorkspaceUser) -> dict[str, Any]:
    try:
        StudentWorkspaceService.require_role(current_user, "admin")
    except AuthorizationError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    return current_user


def require_student(current_user: CurrentWorkspaceUser) -> dict[str, Any]:
    try:
        StudentWorkspaceService.require_role(current_user, "student")
    except AuthorizationError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error
    return current_user


AdminUser = Annotated[dict[str, Any], Depends(require_admin)]
StudentUser = Annotated[dict[str, Any], Depends(require_student)]


def require_registration_attempt_allowed(request: Request) -> None:
    # 只使用连接来源，不读取客户端可自行伪造的 X-Forwarded-For / X-Real-IP。
    client_host = request.client.host if request.client is not None else "unknown"
    StudentWorkspaceService._require_registration_allowed(client_host)


@router.post(
    "/auth/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_registration_attempt_allowed)],
)
def register_student(
    payload: RegisterStudentRequest,
    service: StudentWorkspaceServiceDependency,
) -> dict[str, Any]:
    return service.register_student(**payload.model_dump())


@router.post(
    "/auth/bootstrap",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_admin(
    payload: BootstrapAdminRequest,
    service: StudentWorkspaceServiceDependency,
) -> dict[str, Any]:
    if settings.requires_bootstrap_setup_code:
        configured_code = settings.bootstrap_setup_code
        if not configured_code:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="生产环境尚未设置首次初始化码，请在服务器配置 BOOTSTRAP_SETUP_CODE 后重试",
            )
        if not payload.setup_code or not hmac.compare_digest(payload.setup_code, configured_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="首次初始化码不正确，请联系系统管理员",
            )
    return service.bootstrap_admin(**payload.model_dump(exclude={"setup_code"}))


@router.post("/auth/login", response_model=AuthResponse)
def login(
    payload: AccountCredentials,
    service: StudentWorkspaceServiceDependency,
) -> dict[str, Any]:
    return service.login(**payload.model_dump())


@router.post("/auth/logout", response_model=DetailResponse)
def logout(
    current_user: CurrentWorkspaceUser,
    service: StudentWorkspaceServiceDependency,
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
) -> DetailResponse:
    # 先验证会话属于有效用户，再删除数据库内的令牌哈希。
    del current_user
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    service.logout(credentials.credentials)
    return DetailResponse(detail="已退出登录")


@router.get("/auth/me", response_model=CurrentUserResponse)
def get_current_user(current_user: CurrentWorkspaceUser) -> CurrentUserResponse:
    return CurrentUserResponse(user=current_user)


@router.post(
    "/teacher/students",
    response_model=CreateStudentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_student(
    payload: CreateStudentRequest,
    teacher: AdminUser,
    service: StudentWorkspaceServiceDependency,
) -> CreateStudentResponse:
    user = service.create_student(teacher=teacher, **payload.model_dump())
    return CreateStudentResponse(user=user)


@router.get("/teacher/students", response_model=StudentListResponse)
def list_students(
    teacher: AdminUser,
    service: StudentWorkspaceServiceDependency,
) -> StudentListResponse:
    return StudentListResponse(students=service.list_students(teacher=teacher))


@router.post(
    "/teacher/students/batch",
    response_model=StudentListResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_students_batch(
    payload: CreateStudentsBatchRequest,
    teacher: AdminUser,
    service: StudentWorkspaceServiceDependency,
) -> StudentListResponse:
    students = service.create_students_batch(
        teacher=teacher, students=[student.model_dump() for student in payload.students]
    )
    return StudentListResponse(students=students)


@router.post("/teacher/students/{student_id}/reset-password", response_model=DetailResponse)
def reset_student_password(
    student_id: int,
    payload: ResetStudentPasswordRequest,
    teacher: AdminUser,
    service: StudentWorkspaceServiceDependency,
) -> DetailResponse:
    service.reset_student_password(
        teacher=teacher,
        student_id=student_id,
        password=payload.password,
    )
    return DetailResponse(detail="学生密码已重置，原有登录会话已失效")


@router.get("/me/profile", response_model=CurrentUserResponse)
def get_profile(
    current_user: CurrentWorkspaceUser,
    service: StudentWorkspaceServiceDependency,
) -> CurrentUserResponse:
    return CurrentUserResponse(user=service.get_profile(user=current_user))


@router.get("/me/course-catalog", response_model=CourseCatalogResponse)
def get_course_catalog(
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> CourseCatalogResponse:
    return CourseCatalogResponse(**service.get_course_catalog(user=student))


@router.get("/me/language-progress", response_model=LanguageProgressResponse)
def get_language_progress(
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> LanguageProgressResponse:
    return LanguageProgressResponse(**service.get_language_progress(user=student))


@router.get("/me/course-context", response_model=StudentCourseContextResponse)
def get_course_context(
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> StudentCourseContextResponse:
    return StudentCourseContextResponse(context=service.get_course_context(user=student))


@router.put("/me/course-context", response_model=StudentCourseContextResponse)
def save_course_context(
    payload: CourseContextRequest,
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> StudentCourseContextResponse:
    return StudentCourseContextResponse(
        context=service.save_course_context(user=student, **payload.model_dump())
    )


@router.get("/workspace/state", response_model=WorkspaceStateResponse)
def get_workspace_state(
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> WorkspaceStateResponse:
    return WorkspaceStateResponse(state=service.get_workspace_state(user=student))


@router.put("/workspace/state", response_model=WorkspaceStateResponse)
def save_workspace_state(
    payload: WorkspaceStateRequest,
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> WorkspaceStateResponse:
    result = service.save_workspace_state(user=student, state=payload.state)
    return WorkspaceStateResponse(**result)


@router.get(
    "/me/tasks/today",
    response_model=TodayTasksResponse,
    responses={
        409: {
            "model": CourseContextRequiredResponse,
            "description": "新学生尚未选择已导入课程内容。",
        }
    },
)
def get_today_tasks(
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> TodayTasksResponse:
    return TodayTasksResponse(**service.get_today_tasks(user=student))


@router.post("/me/tasks/{task_id}/start", response_model=StartTaskResponse)
def start_today_task(
    task_id: str,
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> StartTaskResponse:
    return StartTaskResponse(task=service.start_today_task(user=student, task_id=task_id))


@router.post("/me/tasks/{task_id}/complete", response_model=CompleteTodayTaskResponse)
def complete_today_task(
    task_id: str,
    payload: CompleteTodayTaskRequest,
    student: StudentUser,
    service: StudentWorkspaceServiceDependency,
) -> CompleteTodayTaskResponse:
    return CompleteTodayTaskResponse(
        **service.complete_today_task(
            user=student,
            task_id=task_id,
            reflection=payload.reflection,
            evidence=payload.evidence.model_dump(),
        )
    )
