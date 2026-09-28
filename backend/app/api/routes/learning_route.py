"""首页五步、可信作答和统一错题集的账号隔离接口。"""
from typing import Annotated
from fastapi import APIRouter,Depends,HTTPException,Query
from app.api.routes.student_workspace import StudentUser,StudentWorkspaceServiceDependency
from app.repositories.learning_route_repository import LearningRouteRepository
from app.services.daily_learning_route import DailyLearningRoute
from app.services.wrong_question_collection import WrongQuestionCollection
from app.services.wrong_question_queries import collection_detail,list_collection,ensure_learning
from app.services.wrong_question_practice_service import WrongQuestionPractice
from app.services.wrong_question_jobs import WrongQuestionJobs
from app.services.wrong_question_review import WrongQuestionReview
from app.schemas.learning_route import Action,CompleteStep,Answer,Backfill,Job,NextPractice,SubmitPractice,Issue
from app.schemas.learning_route import SelfCheckAnswer, SelfCheckReceipt
from app.services.self_check import SelfCheck

router=APIRouter(prefix='/me/learning',tags=['learning-route'])


def get_repository(workspace:StudentWorkspaceServiceDependency):
    repository=LearningRouteRepository(workspace.repository.database_path)
    if not repository.ready():
        raise HTTPException(503,'新版学习路线尚未完成数据准备，请稍后重试；原有记录保留。')
    return repository

Repository=Annotated[LearningRouteRepository,Depends(get_repository)]


@router.get('/route')
def route(student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).view(student['id'])

@router.post('/route/start')
def start(payload:Action,student:StudentUser,repository:Repository,workspace:StudentWorkspaceServiceDependency):
    workspace.start_today_task(user=student,task_id='math-shapes-diagnosis')
    return DailyLearningRoute(repository).start(student['id'],payload.request_id)

@router.get('/route/steps/{step}')
def activity(step:int,student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).activity(student['id'],step)

@router.post('/route/steps/{step}/start')
def start_step(step:int,payload:Action,student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).activity(student['id'],step)

@router.post('/route/steps/{step}/complete')
def complete(step:int,payload:CompleteStep,student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).complete(student['id'],step,payload.revision,payload.request_id,payload.reflection,payload.responses)

@router.post('/route/retry-test')
def retry_test(payload:Action,student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).retry_test(student['id'],payload.revision)

@router.post('/answers')
def answer(payload:Answer,student:StudentUser,repository:Repository):
    return DailyLearningRoute(repository).answer(student['id'],payload.assignment_id,payload.event_key,payload.answer)

@router.get('/collection')
def collection(student:StudentUser,repository:Repository,source:str|None=None,stage:str|None=None,
               knowledge_point:str|None=None,limit:int=Query(20,ge=1,le=100),offset:int=Query(0,ge=0)):
    with repository.read() as db:
        return list_collection(db,student['id'],source,stage,knowledge_point,limit,offset)


@router.post('/self-check/answers', response_model=SelfCheckReceipt)
def self_check_answer(payload: SelfCheckAnswer, student: StudentUser, repository: Repository):
    return SelfCheck(repository).submit(student['id'], payload.knowledge_point_id, payload.question_id,
                                       payload.request_id, payload.answer)

@router.post('/collection/backfill')
def backfill(payload:Backfill,student:StudentUser,repository:Repository):
    return WrongQuestionCollection(repository).backfill(student['id'],payload.cursor,payload.limit)

@router.get('/collection/{question_id}')
def detail(question_id:int,student:StudentUser,repository:Repository):
    with repository.read() as db:
        return collection_detail(db,student['id'],question_id)

@router.post('/collection/{question_id}/jobs',status_code=202)
def job(question_id:int,payload:Job,student:StudentUser,repository:Repository,workspace:StudentWorkspaceServiceDependency):
    workspace.require_ai_request_allowed(user=student,capability='wrong_question_job_request')
    return WrongQuestionJobs(repository).request(student['id'],question_id,payload.kind,payload.request_id,payload.stage)

@router.get('/jobs/{job_id}')
def job_status(job_id:str,student:StudentUser,repository:Repository):
    return WrongQuestionJobs(repository).get(student['id'],job_id)

@router.post('/jobs/{job_id}/retry',status_code=202)
def retry_job(job_id:str,payload:Action,student:StudentUser,repository:Repository,workspace:StudentWorkspaceServiceDependency):
    workspace.require_ai_request_allowed(user=student,capability='wrong_question_job_request')
    with repository.read() as db:
        row=db.execute('SELECT j.*,l.wrong_question_id FROM wrong_question_ai_jobs j JOIN wrong_question_learning l ON l.id=j.learning_id WHERE j.id=? AND j.user_id=? AND l.suppressed=0',(job_id,student['id'])).fetchone()
        if not row:
            raise HTTPException(404,'未找到你的任务')
        if row['status'] not in ('failed','stale'):
            raise HTTPException(409,'当前任务无需重试')
    return WrongQuestionJobs(repository).request(student['id'],row['wrong_question_id'],row['kind'],payload.request_id)

@router.post('/collection/{question_id}/practice/next')
def next_practice(question_id:int,payload:NextPractice,student:StudentUser,repository:Repository):
    return WrongQuestionPractice(repository).next(student['id'],question_id,payload.request_id,payload.stage)

@router.post('/practice/{item_id}/submit')
def submit_practice(item_id:str,payload:SubmitPractice,student:StudentUser,repository:Repository):
    return WrongQuestionPractice(repository).submit(student['id'],item_id,payload.request_id,payload.revision,payload.answer)

@router.post('/practice/{item_id}/hint')
def hint(item_id:str,payload:Action,student:StudentUser,repository:Repository):
    return WrongQuestionPractice(repository).hint(student['id'],item_id)

@router.post('/practice/{item_id}/report-issue')
def issue(item_id:str,payload:Issue,student:StudentUser,repository:Repository):
    return WrongQuestionPractice(repository).report_issue(student['id'],item_id,payload.reason)

@router.get('/review')
def review(student:StudentUser,repository:Repository):
    return WrongQuestionReview(repository).view(student['id'])

@router.post('/review/start')
def start_review(payload:Action,student:StudentUser,repository:Repository):
    # 显式开始时才为旧上传建立学习状态，不在 GET 做迁移。
    with repository.transaction() as db:
        for q in db.execute('SELECT id FROM wrong_questions WHERE user_id=?',(student['id'],)).fetchall():
            ensure_learning(db,student['id'],q['id'])
    return WrongQuestionReview(repository).start(student['id'])

@router.get('/summary')
def summary(student:StudentUser,repository:Repository):
    route=DailyLearningRoute(repository).activity(student['id'],5)['route']
    review=WrongQuestionReview(repository).view(student['id'])
    return {'route':route,'groups':review['groups'],'resolved':sum(g.get('outcome')=='passed' for g in review['groups']),
            'needs_help':sum(g.get('outcome') in ('needs_help','awaiting_verification','deferred_unavailable') for g in review['groups'])}
