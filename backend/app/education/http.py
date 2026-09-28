"""学校 API 的会话及空间上下文入口；请求头只作为待核验的选择。"""
from typing import Annotated
from uuid import UUID
from fastapi import Depends, Request, Security, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from app.api.routes.student_workspace import CurrentWorkspaceUser, StudentWorkspaceServiceDependency, _bearer_scheme
from app.services.student_workspace_service import StudentWorkspaceService, StudentWorkspaceError
from app.repositories.teacher_repository import TeacherRepository
from .policy import SessionIdentity, SpaceContext, require_context
from .runtime import cutover_enabled, require_cutover
from .errors import EducationError


class EducationRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()
        async def handler(request):
            try:
                response = await original(request)
            except (EducationError, StudentWorkspaceError) as error:
                response = JSONResponse({'detail': str(error)}, status_code=error.status_code)
            response.headers['Cache-Control'] = 'private, no-store'
            return response
        return handler


def identity(user: CurrentWorkspaceUser,
             credentials: HTTPAuthorizationCredentials | None = Security(_bearer_scheme)):
    if credentials is None: raise EducationError('请先登录', 401)
    return SessionIdentity(user['id'], StudentWorkspaceService._hash_token(credentials.credentials))


Identity = Annotated[SessionIdentity, Depends(identity)]


def repository(user: CurrentWorkspaceUser, workspace: StudentWorkspaceServiceDependency):
    repo = TeacherRepository(workspace.repository.database_path)
    with repo.read() as db: require_cutover(db)
    return repo


Repository = Annotated[TeacherRepository, Depends(repository)]


def parse_context(request):
    try:
        return SpaceContext(str(UUID(request.headers['X-Education-Space-Id'])),
            str(UUID(request.headers['X-Education-Membership-Id'])),
            int(request.headers['X-Education-Space-Revision']),
            int(request.headers['X-Education-Membership-Revision']))
    except (KeyError, TypeError, ValueError):
        raise EducationError('请先选择学校或机构，再继续操作', 409) from None


def context(request: Request, actor: Identity, repo: Repository):
    selected = parse_context(request)
    with repo.read() as db: require_context(db, actor, selected)
    return selected


Context = Annotated[SpaceContext, Depends(context)]


def legacy_teacher_gate(request: Request, workspace: StudentWorkspaceServiceDependency):
    # 注册和自述资料不授予学校权限；其余旧认领、旧学情入口在切换后全部关闭。
    if request.url.path.endswith(('/auth/register-teacher', '/teacher/profile')):
        return
    repo = TeacherRepository(workspace.repository.database_path)
    try:
        with repo.read() as db:
            if cutover_enabled(db):
                raise HTTPException(410, '旧认领入口已停用，请进入学校工作区或授权管理', headers={'Cache-Control':'private, no-store'})
    except EducationError as error:
        raise HTTPException(error.status_code, str(error)) from None
