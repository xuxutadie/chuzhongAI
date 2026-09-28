"""新建完全合成的学校权限验收库；拒绝已有路径，不读取真实账号或凭证。"""
import argparse
import hashlib
import json
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.teacher_schema import migrate_teacher_schema
from app.repositories.learning_route_repository import migrate_learning_schema
from app.services.student_workspace_service import StudentWorkspaceService
from app.admin_workspace.schema import migrate_admin_schema
from app.admin_workspace.repository import AdminRepository
from app.admin_workspace.accounts import AdminAccounts
from app.teacher_knowledge.schema import migrate_knowledge_schema, migrate_knowledge_spaces
from app.teacher_knowledge.repository import KnowledgeRepository
from app.education.schema import migrate_education_schema
from app.education.policy import SessionIdentity, SpaceContext
from app.education.service import EducationSpaces
from app.education.grants import StudentGrants


def request(**fields): return {'request_id':str(uuid4()),**fields}
def identity(auth): return SessionIdentity(auth['user']['id'],hashlib.sha256(auth['access_token'].encode()).hexdigest())


def create(target):
    if target.exists(): raise ValueError('只允许创建新的合成验收库')
    target.parent.mkdir(parents=True,exist_ok=True)
    workspace=StudentWorkspaceService(StudentWorkspaceRepository(target))
    password='Education-QA-2026'
    admin=workspace.bootstrap_admin(username='education-qa-admin',password=password,display_name='验收平台管理员（合成）')
    with closing(sqlite3.connect(target)) as db:
        db.execute('BEGIN IMMEDIATE'); migrate_teacher_schema(db); migrate_admin_schema(db); migrate_learning_schema(db)
        migrate_education_schema(db); migrate_knowledge_schema(db); migrate_knowledge_spaces(db)
        db.execute('INSERT INTO education_schema_versions VALUES(2)'); db.commit()
    repo=AdminRepository(target)
    for username in ('education-qa-teacher','education-qa-unjoined'):
        AdminAccounts(repo).create_account(admin['user']['id'],request(admin_password=password,username=username,password=password,role='teacher',display_name=username))
    teacher=workspace.login(username='education-qa-teacher',password=password)
    student=workspace.register_student(username='education-qa-student',password=password,display_name='验收学生（合成）')
    admin_service=EducationSpaces(repo,identity(admin)); teacher_service=EducationSpaces(repo,identity(teacher))
    contexts=[]
    for name in ('验收甲校（合成）','验收乙校（合成）'):
        space=admin_service.create_space(request(name=name,kind='school'))
        invitation=admin_service.invite_member(None,request(space_id=space['id'],target_id=teacher['user']['id'],role='school_admin'))
        member=teacher_service.accept_member(request(token=invitation['token']))
        context=SpaceContext(space['id'],member['id'],1,1); contexts.append(context)
        KnowledgeRepository(target,identity=identity(teacher),context=context).create('textbooks',teacher['user']['id'],{'title':name+'专属教材','grade':'七年级','edition':'北师大版','semester':'上册','file_ids':[]})
    invite=StudentGrants(repo,identity(teacher)).invite(contexts[0],request(student_id=student['user']['id']))
    with (target.parent/'qa-invitation.json').open('x',encoding='utf-8') as file:
        json.dump({'student_invitation':invite['token'],'student_id':student['user']['id']},file,ensure_ascii=False)
    return {'database':str(target),'notice':'仅合成账号；AI/OCR 未配置，不调用外部服务。'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--database',required=True,type=Path)
    print(json.dumps(create(parser.parse_args().database.resolve()),ensure_ascii=False))
