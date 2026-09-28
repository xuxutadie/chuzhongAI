"""全站管理专用路由；不扩大原教师或学生端权限。"""
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, Query, Response, Security
from fastapi.security import HTTPAuthorizationCredentials
from app.api.routes.student_workspace import AdminUser, StudentWorkspaceServiceDependency, _bearer_scheme
from app.services.student_workspace_service import StudentWorkspaceService
from app.admin_workspace.repository import AdminRepository
from app.admin_workspace.accounts import AdminAccounts
from app.admin_workspace.views import AdminStudentViews
from app.admin_workspace.teacher_views import AdminTeacherViews
from app.admin_workspace.errors import AdminError
from app.schemas.admin_workspace import Account, CreateAccount, UpdateAccount, StateChange, PasswordReset, ViewEvent


def private_response(response:Response):
    response.headers['Cache-Control']='private, no-store'


router=APIRouter(prefix='/admin',dependencies=[Depends(private_response)])


def repository(workspace:StudentWorkspaceServiceDependency):
    repo=AdminRepository(workspace.repository.database_path)
    if not repo.ready(): raise AdminError('管理员功能需要完成数据库升级',503)
    return repo


Repository=Annotated[AdminRepository,Depends(repository)]


def account_writer(actor:AdminUser,repo:Repository,
                   credentials:Annotated[HTTPAuthorizationCredentials,Security(_bearer_scheme)]):
    return AdminAccounts(repo,session_token_hash=StudentWorkspaceService._hash_token(credentials.credentials))


AccountWriter=Annotated[AdminAccounts,Depends(account_writer)]


@router.get('/accounts')
def accounts(actor:AdminUser,repo:Repository,search:str=Query('',max_length=100),role:str|None=None,
             state:Literal['active','disabled','deleted','all']='active',offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    return AdminAccounts(repo).list_accounts(actor['id'],search=search,role=role,state=state,offset=offset,limit=limit)


@router.get('/accounts/{target_id}',response_model=Account)
def account(target_id:int,actor:AdminUser,repo:Repository): return AdminAccounts(repo).get_account(actor['id'],target_id)


@router.post('/accounts',response_model=Account,status_code=201)
def create(payload:CreateAccount,actor:AdminUser,writer:AccountWriter): return writer.create_account(actor['id'],payload.model_dump())


@router.put('/accounts/{target_id}',response_model=Account)
def update(target_id:int,payload:UpdateAccount,actor:AdminUser,writer:AccountWriter): return writer.update_account(actor['id'],target_id,payload.model_dump())


@router.post('/accounts/{target_id}/state',response_model=Account)
def state(target_id:int,payload:StateChange,actor:AdminUser,writer:AccountWriter): return writer.change_state(actor['id'],target_id,payload.model_dump())


@router.post('/accounts/{target_id}/reset-password',response_model=Account)
def reset(target_id:int,payload:PasswordReset,actor:AdminUser,writer:AccountWriter): return writer.reset_password(actor['id'],target_id,payload.model_dump())


@router.get('/events')
def events(actor:AdminUser,repo:Repository,target_id:int|None=None,offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    return AdminAccounts(repo).list_events(actor['id'],target_id=target_id,offset=offset,limit=limit)


@router.post('/view-events',status_code=204)
def view_event(payload:ViewEvent,actor:AdminUser,repo:Repository):
    AdminStudentViews(repo).open_view(actor['id'],payload.target_id,payload.kind,payload.request_id)
    return Response(status_code=204,headers={'Cache-Control':'private, no-store'})


@router.get('/views/students/{target_id}')
def student(target_id:int,actor:AdminUser,repo:Repository):
    return AdminStudentViews(repo).overview(actor['id'],target_id)|{'account':AdminAccounts(repo).get_account(actor['id'],target_id)}


@router.get('/views/students/{target_id}/history')
def history(target_id:int,actor:AdminUser,repo:Repository,kind:Literal['learning','assessments','reports','wrong-questions'],offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    return AdminStudentViews(repo).history(actor['id'],target_id,kind,offset,limit)|{'offset':offset,'limit':limit}


@router.get('/views/students/{target_id}/assessments/{attempt_id}')
def assessment(target_id:int,attempt_id:str,actor:AdminUser,repo:Repository): return AdminStudentViews(repo).assessment(actor['id'],target_id,attempt_id)


@router.get('/views/students/{target_id}/assessments/{attempt_id}/pdf')
def pdf(target_id:int,attempt_id:str,actor:AdminUser,repo:Repository):
    try: content=AdminStudentViews(repo).report_pdf(actor['id'],target_id,attempt_id)
    except (ImportError,FileNotFoundError): raise AdminError('PDF 暂不可用，请先查看网页报告',503) from None
    return Response(content,media_type='application/pdf',headers={'Cache-Control':'private, no-store','Content-Disposition':'attachment; filename="student-diagnosis.pdf"','X-Content-Type-Options':'nosniff'})


@router.get('/views/students/{target_id}/wrong-questions/{question_id}')
def wrong(target_id:int,question_id:int,actor:AdminUser,repo:Repository): return AdminStudentViews(repo).wrong_question(actor['id'],target_id,question_id)


@router.get('/views/students/{target_id}/wrong-questions/{question_id}/image')
def image(target_id:int,question_id:int,actor:AdminUser,repo:Repository):
    content,media=AdminStudentViews(repo).wrong_image(actor['id'],target_id,question_id)
    return Response(content,media_type=media,headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})


@router.get('/views/teachers/{target_id}')
def teacher(target_id:int,actor:AdminUser,repo:Repository): return AdminTeacherViews(repo).overview(actor['id'],target_id)


@router.get('/views/teachers/{target_id}/students')
def students(target_id:int,actor:AdminUser,repo:Repository,offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    return AdminTeacherViews(repo).students(actor['id'],target_id,offset,limit)


@router.get('/views/teachers/{target_id}/knowledge/{resource}')
def knowledge(target_id:int,resource:str,actor:AdminUser,repo:Repository,offset:int=Query(0,ge=0),limit:int=Query(20,ge=1,le=100)):
    return AdminTeacherViews(repo).knowledge(actor['id'],target_id,resource,offset,limit)


@router.get('/views/teachers/{target_id}/knowledge/{resource}/{resource_id}')
def knowledge_detail(target_id:int,resource:str,resource_id:str,actor:AdminUser,repo:Repository):
    return AdminTeacherViews(repo).knowledge_detail(actor['id'],target_id,resource,resource_id)
