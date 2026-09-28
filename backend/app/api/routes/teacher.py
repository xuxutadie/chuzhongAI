"""教师注册与认领入口，全程使用工作台会话，不采信角色请求头。"""
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, HTTPException, Response, Query
from app.api.routes.student_workspace import (
    CurrentWorkspaceUser, StudentUser, StudentWorkspaceServiceDependency, require_registration_attempt_allowed,
)
from app.repositories.teacher_repository import TeacherRepository
from app.schemas.student_workspace import AuthResponse
from app.schemas.teacher import TeacherRegister, TeacherProfile, TeacherProfileInput, ClaimRequest, ClaimReceipt, ClaimCode, StudentTeacherLink
from app.services.teacher_accounts import TeacherAccounts
from app.services.teacher_links import TeacherLinks
from app.services.teacher_insights import TeacherInsights
from app.schemas.teacher import StudentList, StudentOverview, InsightHistory, AssessmentDetail, WrongDetail
from app.education.http import legacy_teacher_gate

router = APIRouter(dependencies=[Depends(legacy_teacher_gate)])


def require_teacher(user: CurrentWorkspaceUser):
    if user['role'] not in ('admin', 'teacher'):
        raise HTTPException(403, '请使用教师账号访问')
    return user


TeacherUser = Annotated[dict, Depends(require_teacher)]


def teacher_repository(workspace: StudentWorkspaceServiceDependency):
    repository = TeacherRepository(workspace.repository.database_path)
    if not repository.ready():
        raise HTTPException(503, '教师功能尚未完成数据库升级，请联系管理员')
    return repository


Repository = Annotated[TeacherRepository, Depends(teacher_repository)]


@router.post('/auth/register-teacher', response_model=AuthResponse, status_code=201,
             dependencies=[Depends(require_registration_attempt_allowed)])
def register_teacher(payload: TeacherRegister, repository: Repository, workspace: StudentWorkspaceServiceDependency):
    return TeacherAccounts(repository, workspace).register(**payload.model_dump())


@router.get('/teacher/profile', response_model=TeacherProfile)
def profile(teacher: TeacherUser, repository: Repository, workspace: StudentWorkspaceServiceDependency, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherAccounts(repository, workspace).profile(teacher['id'])


@router.put('/teacher/profile', response_model=TeacherProfile)
def update_profile(payload: TeacherProfileInput, teacher: TeacherUser, repository: Repository,
                   workspace: StudentWorkspaceServiceDependency):
    return TeacherAccounts(repository, workspace).save_profile(teacher['id'], **payload.model_dump())


@router.post('/me/teacher-links/code', response_model=ClaimCode)
def issue_code(student: StudentUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherLinks(repository).issue_code(student['id'])


@router.get('/me/teacher-links', response_model=list[StudentTeacherLink])
def student_links(student: StudentUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherLinks(repository).list_for_student(student['id'])


@router.post('/teacher/claims', response_model=ClaimReceipt)
def claim(payload: ClaimRequest, teacher: TeacherUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherLinks(repository).claim(teacher['id'], payload.code, payload.request_id)


@router.delete('/teacher/links/{link_id}', status_code=204)
def revoke_teacher(link_id: int, teacher: TeacherUser, repository: Repository):
    TeacherLinks(repository).revoke(teacher['id'], teacher['role'], link_id)


@router.delete('/me/teacher-links/{link_id}', status_code=204)
def revoke_student(link_id: int, student: StudentUser, repository: Repository):
    TeacherLinks(repository).revoke(student['id'], 'student', link_id)


@router.get('/teacher/linked-students', response_model=StudentList)
def students(teacher: TeacherUser, repository: Repository, response: Response,
             offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100),
             school: str = Query('',max_length=100), class_name: str = Query('',max_length=40),
             grade: str = Query('',max_length=24), name: str = Query('',max_length=40)):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherInsights(repository).students(teacher['id'], {'school':school,'class_name':class_name,'grade':grade,'name':name},offset,limit)


@router.get('/teacher/linked-students/{student_id}', response_model=StudentOverview)
def overview(student_id: int, teacher: TeacherUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherInsights(repository).overview(teacher['id'],student_id)


@router.get('/teacher/linked-students/{student_id}/history', response_model=InsightHistory)
def history(student_id: int, teacher: TeacherUser, repository: Repository, response: Response,
            kind: Literal['learning','assessments','wrong-questions','reports'],
            offset: int = Query(0,ge=0), limit: int = Query(20,ge=1,le=100)):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherInsights(repository).history(teacher['id'],student_id,kind,offset,limit)


@router.get('/teacher/linked-students/{student_id}/assessments/{attempt_id}', response_model=AssessmentDetail)
def assessment(student_id: int, attempt_id: str, teacher: TeacherUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherInsights(repository).assessment(teacher['id'],student_id,attempt_id)


@router.get('/teacher/linked-students/{student_id}/assessments/{attempt_id}/pdf')
def report_pdf(student_id: int, attempt_id: str, teacher: TeacherUser, repository: Repository):
    try:
        content = TeacherInsights(repository).report_pdf(teacher['id'],student_id,attempt_id)
    except (ImportError,FileNotFoundError) as error:
        raise HTTPException(503,'PDF 组件或中文字体暂不可用，请先查看网页报告') from error
    return Response(content,media_type='application/pdf',headers={'Cache-Control':'private, no-store',
        'Content-Disposition':'attachment; filename="student-diagnosis.pdf"','X-Content-Type-Options':'nosniff'})


@router.get('/teacher/linked-students/{student_id}/wrong-questions/{question_id}', response_model=WrongDetail)
def wrong_question(student_id: int, question_id: int, teacher: TeacherUser, repository: Repository, response: Response):
    response.headers['Cache-Control'] = 'private, no-store'
    return TeacherInsights(repository).wrong_question(teacher['id'],student_id,question_id)


@router.get('/teacher/linked-students/{student_id}/wrong-questions/{question_id}/image')
def wrong_image(student_id: int, question_id: int, teacher: TeacherUser, repository: Repository):
    content, media = TeacherInsights(repository).wrong_image(teacher['id'],student_id,question_id)
    return Response(content, media_type=media, headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
