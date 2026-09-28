"""只建立独立验收数据库，不读取或修改正式学生数据。"""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.learning_route_repository import LearningRouteRepository,migrate_learning_schema
from app.services.student_workspace_service import StudentWorkspaceService
from app.services.transition_diagnosis import DiagnosisService
from app.services.wrong_question_collection import WrongQuestionCollection


def seed(path):
    if path.exists():
        raise ValueError('验收库已经存在，不覆盖')
    repository=StudentWorkspaceRepository(path)
    service=StudentWorkspaceService(repository)
    user=service.register_student(username='route-qa',password='Route-QA-2026-only',display_name='五步流程验收',grade='初一')['user']
    learning=LearningRouteRepository(path)
    with learning.transaction() as db:
        migrate_learning_schema(db)
    service.save_course_context(user=user,course_id='nnu-math-g7-upper',chapter_id='g7u-chapter-2',knowledge_point_ids=['g7u-c2-addition'])
    diagnosis=DiagnosisService(path,collector=WrongQuestionCollection(learning))
    diagnosis.save_profile(user['id'],0,{'nickname':'验收同学','grade':'六年级','textbook':'北师大版','daily_minutes':'20'},True)
    attempt=diagnosis.start(user['id'])
    with diagnosis.connection() as db:
        paper=json.loads(db.execute('SELECT paper_json FROM diagnosis_attempts WHERE id=?',(attempt['id'],)).fetchone()[0])
    answers={q['id']:q['answer'] for q in paper}
    saved=diagnosis.save_answers(user['id'],attempt['id'],0,answers,{})
    diagnosis.submit(user['id'],attempt['id'],saved['revision'])
    print('独立验收库已创建：不含真实学生数据。')

if __name__=='__main__':
    seed(Path(sys.argv[1]).resolve())
