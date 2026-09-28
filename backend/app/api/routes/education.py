"""多学校工作区；完整迁移前统一拒绝业务请求，不混用旧认领权限。"""
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Request, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from app.api.routes.student_workspace import CurrentWorkspaceUser, StudentWorkspaceServiceDependency
from app.repositories.teacher_repository import TeacherRepository
from app.education.http import EducationRoute, Identity, Context, Repository, parse_context
from app.education.runtime import cutover_enabled
from app.education.service import EducationSpaces
from app.education.grants import StudentGrants
from app.education.insights import ScopedTeacherInsights
from app.education.policy import require_platform_admin
from app.education.models import CreateSpace, MemberInvite, AcceptInvite, StateChange, HistoryInvite, ConfirmHistory, RevokeGrant, MemberRoleChange
from app.education.ai_allocations import SchoolAIAllocations, AllocationChange

router = APIRouter(prefix='/education', route_class=EducationRoute)


@router.get('/spaces/{space_id}/ai')
def school_ai(space_id:UUID,actor:Identity,repo:Repository):
    return {'items':SchoolAIAllocations(repo,actor).list(str(space_id))}


@router.put('/spaces/{space_id}/ai/{capability}')
def allocate_ai(space_id:UUID,capability:Literal['llm','ocr'],payload:AllocationChange,actor:Identity,repo:Repository):
    return SchoolAIAllocations(repo,actor).set(str(space_id),capability,payload.model_dump(mode='json'))


class TokenPreview(BaseModel):
    model_config = ConfigDict(extra='forbid')
    token: str = Field(min_length=20, max_length=128)


@router.post('/member-invitations/preview')
def preview_member(payload:TokenPreview,actor:Identity,repo:Repository):
    return EducationSpaces(repo,actor).preview_member(payload.token)


@router.get('/spaces/{space_id}/members')
def list_members(space_id:UUID,request:Request,actor:Identity,repo:Repository,
                 offset:int=Query(default=0,ge=0),limit:int=Query(default=20,ge=1,le=100)):
    selected=parse_context(request) if request.headers.get('X-Education-Space-Id') else None
    return EducationSpaces(repo,actor).members(selected,str(space_id),offset,limit)


@router.post('/members/{membership_id}/role')
def member_role(membership_id:UUID,payload:MemberRoleChange,actor:Identity,context:Context,repo:Repository):
    return EducationSpaces(repo,actor).set_member_role(context,str(membership_id),payload.model_dump(mode='json'))


@router.get('/status')
def status(user: CurrentWorkspaceUser, workspace: StudentWorkspaceServiceDependency):
    with TeacherRepository(workspace.repository.database_path).read() as db:
        return {'enabled':cutover_enabled(db)}


@router.get('/me/spaces')
def my_spaces(actor: Identity, repo: Repository):
    from app.education.policy import require_session
    with repo.read() as db:
        require_session(db,actor)
        rows = db.execute('''SELECT s.id,s.name,s.kind,s.revision AS space_revision,m.id AS membership_id,
            m.revision AS membership_revision,m.role FROM education_spaces s JOIN education_memberships m ON m.space_id=s.id
            WHERE m.user_id=? AND m.state='active' AND s.state='active' ORDER BY s.name,s.id''',(actor.user_id,)).fetchall()
        return {'items':[dict(row) for row in rows]}


@router.get('/spaces')
def spaces(actor: Identity, repo: Repository):
    with repo.read() as db: require_platform_admin(db,actor)
    return {'items':EducationSpaces(repo,actor).list_spaces()}


@router.post('/spaces', status_code=201)
def create_space(payload: CreateSpace, actor: Identity, repo: Repository):
    return EducationSpaces(repo,actor).create_space(payload.model_dump(mode='json'))


@router.post('/spaces/{space_id}/state')
def space_state(space_id: UUID, payload: StateChange, actor: Identity, repo: Repository):
    return EducationSpaces(repo,actor).set_space_state(str(space_id),payload.model_dump(mode='json'))


@router.post('/member-invitations', status_code=201)
def invite_member(payload: MemberInvite, request: Request, actor: Identity, repo: Repository):
    selected = parse_context(request) if request.headers.get('X-Education-Space-Id') else None
    return EducationSpaces(repo,actor).invite_member(selected,payload.model_dump(mode='json'))


@router.post('/member-invitations/accept')
def accept_member(payload: AcceptInvite, actor: Identity, repo: Repository):
    return EducationSpaces(repo,actor).accept_member(payload.model_dump(mode='json'))


@router.post('/members/{membership_id}/state')
def member_state(membership_id: UUID, payload: StateChange, actor: Identity, context: Context, repo: Repository):
    return EducationSpaces(repo,actor).set_member_state(context,str(membership_id),payload.model_dump(mode='json'))


@router.post('/history-invitations', status_code=201)
def invite_history(payload: HistoryInvite, actor: Identity, context: Context, repo: Repository):
    return StudentGrants(repo,actor).invite(context,payload.model_dump(mode='json'))


@router.post('/history-invitations/preview')
def preview_history(payload: TokenPreview, actor: Identity, repo: Repository):
    return StudentGrants(repo,actor).preview(payload.token)


@router.post('/grants', status_code=201)
def consent(payload: ConfirmHistory, actor: Identity, repo: Repository):
    return StudentGrants(repo,actor).confirm(payload.model_dump(mode='json'))


@router.get('/grants')
def my_grants(actor: Identity, repo: Repository):
    return {'items':StudentGrants(repo,actor).list_mine()}


@router.post('/grants/{grant_id}/revoke')
def revoke(grant_id: UUID, payload: RevokeGrant, actor: Identity, repo: Repository):
    return StudentGrants(repo,actor).revoke(str(grant_id),payload.model_dump(mode='json'))


@router.get('/students')
def students(actor: Identity, context: Context, repo: Repository, name: str = Query('',max_length=40),
             offset: int = Query(0,ge=0), limit: int = Query(20,ge=1,le=100)):
    return ScopedTeacherInsights(repo,actor,context).students(name=name,offset=offset,limit=limit)


@router.get('/students/{student_id}')
def overview(student_id: int, actor: Identity, context: Context, repo: Repository):
    return ScopedTeacherInsights(repo,actor,context).read('overview',student_id)


@router.get('/students/{student_id}/history')
def history(student_id: int, actor: Identity, context: Context, repo: Repository,
            kind: Literal['learning','assessments','wrong-questions','reports'],
            offset: int = Query(0,ge=0), limit: int = Query(20,ge=1,le=100)):
    return ScopedTeacherInsights(repo,actor,context).read('history',student_id,kind,offset,limit)


@router.get('/students/{student_id}/assessments/{attempt_id}')
def assessment(student_id: int, attempt_id: UUID, actor: Identity, context: Context, repo: Repository):
    return ScopedTeacherInsights(repo,actor,context).read('assessment',student_id,str(attempt_id))


@router.get('/students/{student_id}/assessments/{attempt_id}/pdf')
def report(student_id: int, attempt_id: UUID, actor: Identity, context: Context, repo: Repository):
    content = ScopedTeacherInsights(repo,actor,context).read('report_pdf',student_id,str(attempt_id))
    return Response(content,media_type='application/pdf',headers={'Content-Disposition':'attachment; filename="diagnosis.pdf"','X-Content-Type-Options':'nosniff'})


@router.get('/students/{student_id}/wrong-questions/{question_id}')
def wrong(student_id: int, question_id: int, actor: Identity, context: Context, repo: Repository):
    return ScopedTeacherInsights(repo,actor,context).read('wrong_question',student_id,question_id)


@router.get('/students/{student_id}/wrong-questions/{question_id}/image')
def wrong_image(student_id: int, question_id: int, actor: Identity, context: Context, repo: Repository):
    content, media = ScopedTeacherInsights(repo,actor,context).read('wrong_image',student_id,question_id)
    return Response(content,media_type=media,headers={'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})
