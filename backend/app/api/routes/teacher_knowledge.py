"""教师知识库专用接口，所有资源均从会话确定所属人。"""
from typing import Annotated,Literal
from uuid import UUID
from fastapi import APIRouter,Depends,Request,Response,Query
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import ValidationError,Field
from app.api.routes.teacher import TeacherUser
from app.api.routes.student_workspace import StudentWorkspaceServiceDependency
from app.schemas.teacher_knowledge import StrictModel,QuestionInput,CourseScope,GenerationRequest
from app.teacher_knowledge.repository import KnowledgeRepository,KnowledgeError
from app.teacher_knowledge.files import KnowledgeFiles
from app.teacher_knowledge.jobs import KnowledgeJobs
from app.teacher_knowledge.textbooks import TextbookService
from app.teacher_knowledge.scope import system_catalog
from app.teacher_knowledge.questions import QuestionService
from app.teacher_knowledge.question_sets import QuestionSetService
from app.teacher_knowledge.teacher_ai import TeacherKnowledgeAI
from app.teacher_knowledge.generation import GenerationService
from app.education.http import Identity,parse_context
from app.education.runtime import cutover_enabled
from app.education.errors import EducationError


class PrivateRoute(APIRoute):
    def get_route_handler(self):
        original=super().get_route_handler()
        async def handler(request):
            try:
                response=await original(request)
                bound=getattr(request.state,'knowledge_repository',None)
                if bound is not None: bound.fresh_access(request.state.knowledge_owner)
            except (KnowledgeError,EducationError) as error:
                response=JSONResponse({'detail':str(error)},status_code=error.status_code)
            except ValidationError:
                response=JSONResponse({'detail':'资料格式不正确，请检查必填项和数值'},status_code=422)
            response.headers['Cache-Control']='private, no-store'
            return response
        return handler


router=APIRouter(prefix='/teacher/knowledge',route_class=PrivateRoute)


def repository(request:Request,teacher:TeacherUser,workspace:StudentWorkspaceServiceDependency,actor:Identity):
    repo=KnowledgeRepository(workspace.repository.database_path)
    with repo.read() as db: enabled=cutover_enabled(db)
    if enabled:
        repo=KnowledgeRepository(repo.path,identity=actor,context=parse_context(request))
    if not repo.ready(): raise KnowledgeError('知识库尚未完成数据库升级，请联系管理员',503)
    repo.fresh_access(teacher['id'])
    request.state.knowledge_repository=repo
    request.state.knowledge_owner=teacher['id']
    return repo


Repo=Annotated[KnowledgeRepository,Depends(repository)]
RESOURCES={'files':'files','textbooks':'textbooks','chapters':'chapters','chapter-versions':'chapter_versions',
           'questions':'questions','question-versions':'question_versions','question-sets':'question_sets','sources':'generation_sources'}


class Revision(StrictModel):
    expected_revision:int=Field(ge=1)


class Review(Revision):
    confirmed_checks:list[str]=Field(default_factory=list)


class BookInput(StrictModel):
    title:str=Field(min_length=1,max_length=200)
    grade:str=Field(min_length=1,max_length=30)
    edition:str=Field(min_length=1,max_length=100)
    semester:str=Field(min_length=1,max_length=30)


class QuestionSave(StrictModel):
    content:QuestionInput
    question_id:str|None=None
    expected_revision:int|None=None


class AttachFile(Revision):
    file_id:str


class ChapterSave(StrictModel):
    content:dict
    expected_revision:int|None=None


class SetSave(StrictModel):
    purpose:Literal['test','practice']
    question_version_ids:list[str]=Field(min_length=1,max_length=50)
    scope:CourseScope
    set_id:str|None=None
    expected_revision:int|None=None


class ImportRequest(StrictModel):
    file_ids:list[str]=Field(min_length=1,max_length=10)
    mode:Literal['local','questions']='local'
    request_id:str=Field(min_length=1,max_length=100)


class SplitInput(Revision):
    children:list[QuestionInput]=Field(min_length=2,max_length=20)


class MergeInput(StrictModel):
    version_ids:list[str]=Field(min_length=2,max_length=20)
    expected_revisions:list[int]=Field(min_length=2,max_length=20)
    content:QuestionInput


@router.get('/catalog')
def catalog(teacher:TeacherUser,repo:Repo): return system_catalog()


@router.get('/ai')
def ai_status(teacher:TeacherUser,workspace:StudentWorkspaceServiceDependency,repo:Repo):
    return TeacherKnowledgeAI(workspace.repository,knowledge_repository=repo).status(teacher['id'])


@router.put('/ai/{capability}')
def ai_save(capability:Literal['llm','ocr'],payload:dict,teacher:TeacherUser,workspace:StudentWorkspaceServiceDependency,repo:Repo):
    return TeacherKnowledgeAI(workspace.repository,knowledge_repository=repo).save_config(teacher['id'],capability,payload)


@router.delete('/ai/{capability}')
def ai_clear(capability:Literal['llm','ocr'],teacher:TeacherUser,workspace:StudentWorkspaceServiceDependency,repo:Repo):
    TeacherKnowledgeAI(workspace.repository,knowledge_repository=repo).clear_config(teacher['id'],capability)
    return {'cleared':True}


@router.post('/files',status_code=201)
async def upload(request:Request,teacher:TeacherUser,repo:Repo,filename:str=Query(max_length=200)):
    maximum=(5 if filename.lower().endswith(('.png','.jpg','.jpeg','.webp')) else 20)*1024*1024
    data=bytearray()
    async for chunk in request.stream():
        if len(data)+len(chunk)>maximum: raise KnowledgeError('文件超过大小限制',413)
        data.extend(chunk)
    return KnowledgeFiles(repo).store(teacher['id'],filename,bytes(data))


@router.get('/files/{file_id}/download')
def download(file_id:UUID,teacher:TeacherUser,repo:Repo):
    file_id=str(file_id); files=KnowledgeFiles(repo)
    item=repo.owned('files',teacher['id'],file_id)
    content,media=files.read(teacher['id'],file_id)
    # 仅本地解码清洗出的 PNG 允许内嵌，其余原件始终作为附件。
    disposition='inline' if item['data'].get('asset') and media=='image/png' else 'attachment'
    return Response(content,media_type=media,headers={'Content-Disposition':f'{disposition}; filename="resource"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"})


@router.post('/imports',status_code=202)
def import_files(payload:ImportRequest,teacher:TeacherUser,repo:Repo,workspace:StudentWorkspaceServiceDependency):
    for identifier in payload.file_ids:
        if repo.owned('files',teacher['id'],identifier)['archived']: raise KnowledgeError('文件已归档，请先恢复')
    if payload.mode=='questions': TeacherKnowledgeAI(workspace.repository,knowledge_repository=repo).resolve(teacher['id'],'llm')
    return KnowledgeJobs(repo).enqueue(teacher['id'],'import',{'units':[{'file_id':i} for i in payload.file_ids],'mode':payload.mode},payload.request_id)


@router.post('/generations',status_code=202)
def generate(payload:GenerationRequest,teacher:TeacherUser,repo:Repo,workspace:StudentWorkspaceServiceDependency):
    return GenerationService(repo,TeacherKnowledgeAI(workspace.repository,knowledge_repository=repo)).enqueue(teacher['id'],payload)


@router.get('/jobs')
def jobs(teacher:TeacherUser,repo:Repo,offset:int=Query(default=0,ge=0),limit:int=Query(default=20,ge=1,le=100)):
    with repo.read() as db:
        clause,args=repo.scope_clause(db,teacher['id'])
        total=db.execute('SELECT count(*) FROM tk_jobs WHERE owner_id=?'+clause,[teacher['id'],*args]).fetchone()[0]
        ids=[r[0] for r in db.execute('SELECT id FROM tk_jobs WHERE owner_id=?'+clause+' ORDER BY created_at DESC LIMIT ? OFFSET ?',[teacher['id'],*args,limit,offset])]
    return {'items':[KnowledgeJobs(repo).status(teacher['id'],i) for i in ids],'total':total,'offset':offset,'limit':limit}


@router.get('/jobs/{job_id}')
def job(job_id:UUID,teacher:TeacherUser,repo:Repo): return KnowledgeJobs(repo).status(teacher['id'],str(job_id))


@router.post('/jobs/{job_id}/{action}')
def job_action(job_id:UUID,action:Literal['cancel','retry'],payload:Revision,teacher:TeacherUser,repo:Repo):
    method=KnowledgeJobs(repo).cancel if action=='cancel' else KnowledgeJobs(repo).retry_failed
    return method(teacher['id'],str(job_id),payload.expected_revision)


@router.post('/textbooks',status_code=201)
def new_book(payload:BookInput,teacher:TeacherUser,repo:Repo): return TextbookService(repo).create(teacher['id'],payload.model_dump())


@router.post('/textbooks/{book_id}/files')
def attach(book_id:UUID,payload:AttachFile,teacher:TeacherUser,repo:Repo):
    return TextbookService(repo).attach_file(teacher['id'],str(book_id),payload.file_id,payload.expected_revision)


@router.post('/textbooks/{book_id}/chapters',status_code=201)
def chapter(book_id:UUID,payload:ChapterSave,teacher:TeacherUser,repo:Repo):
    return TextbookService(repo).save_chapter(teacher['id'],str(book_id),payload.content,payload.expected_revision)


@router.post('/questions',status_code=201)
def question_save(payload:QuestionSave,teacher:TeacherUser,repo:Repo):
    return QuestionService(repo).save(teacher['id'],payload.content,payload.question_id,payload.expected_revision)


@router.post('/question-versions/{identifier}/split',status_code=201)
def split(identifier:UUID,payload:SplitInput,teacher:TeacherUser,repo:Repo):
    return QuestionService(repo).split(teacher['id'],str(identifier),payload.children,payload.expected_revision)


@router.post('/questions/merge',status_code=201)
def merge(payload:MergeInput,teacher:TeacherUser,repo:Repo):
    return QuestionService(repo).merge(teacher['id'],payload.version_ids,payload.content,payload.expected_revisions)


@router.post('/question-sets',status_code=201)
def set_save(payload:SetSave,teacher:TeacherUser,repo:Repo):
    return QuestionSetService(repo).save(teacher['id'],**payload.model_dump())


@router.get('/question-sets/{set_id}/preview')
def preview(set_id:UUID,teacher:TeacherUser,repo:Repo): return QuestionSetService(repo).preview(teacher['id'],str(set_id))


@router.post('/{resource}/{identifier}/review')
def review(resource:str,identifier:UUID,payload:Review,teacher:TeacherUser,repo:Repo):
    if resource=='question-versions': return QuestionService(repo).review(teacher['id'],str(identifier),payload.expected_revision,payload.confirmed_checks)
    if resource=='chapter-versions': return TextbookService(repo).review_chapter(teacher['id'],str(identifier),payload.expected_revision)
    if resource=='question-sets': return QuestionSetService(repo).review(teacher['id'],str(identifier),payload.expected_revision)
    raise KnowledgeError('此资源不支持审核',404)


@router.post('/{resource}/{identifier}/{action}')
def archive(resource:str,identifier:UUID,action:Literal['archive','restore'],payload:Revision,teacher:TeacherUser,repo:Repo):
    if resource not in ('questions','textbooks','files'): raise KnowledgeError('无效的归档对象',404)
    item=repo.owned(resource,teacher['id'],str(identifier))
    return repo.update(resource,teacher['id'],str(identifier),item['data'],payload.expected_revision,archived=action=='archive')


@router.get('/{resource}')
def listing(resource:str,teacher:TeacherUser,repo:Repo,offset:int=Query(default=0,ge=0),limit:int=Query(default=20,ge=1,le=100),
            search:str=Query(default='',max_length=200),archived:bool=False,status:str='',grade:str='',edition:str='',difficulty:str='',response_type:str='',parent_id:str=''):
    if resource not in RESOURCES: raise KnowledgeError('无效的资源类型',404)
    return repo.listing(RESOURCES[resource],teacher['id'],offset=offset,limit=limit,search=search,archived=archived,
        filters={'status':status,'grade':grade,'edition':edition,'difficulty':difficulty,'response_type':response_type,'parent_id':parent_id})


@router.get('/{resource}/{identifier}')
def detail(resource:str,identifier:UUID,teacher:TeacherUser,repo:Repo):
    if resource not in RESOURCES: raise KnowledgeError('无效的资源类型',404)
    return repo.owned(RESOURCES[resource],teacher['id'],str(identifier))
