"""浏览器验收专用合成数据；拒绝覆盖已有数据库。"""
import argparse
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.teacher_repository import TeacherRepository
from app.repositories.teacher_schema import migrate_teacher_schema
from app.admin_workspace.schema import migrate_admin_schema
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository
from app.services.student_workspace_service import StudentWorkspaceService
from app.services.teacher_accounts import TeacherAccounts


def create(path):
    if path.exists(): raise ValueError('验收数据库已存在，禁止覆盖')
    service=StudentWorkspaceService(StudentWorkspaceRepository(path))
    admin=service.bootstrap_admin(username='admin-qa',password='Admin-QA-2026',display_name='验收管理员')['user']
    repo=TeacherRepository(path)
    with repo.transaction() as db:
        migrate_admin_schema(db)
        # 教师迁移要求外键关闭，管理结构不更改 users 时无需重复旧迁移。
    import sqlite3
    from contextlib import closing
    with closing(sqlite3.connect(path)) as db,db:
        db.execute('BEGIN IMMEDIATE');migrate_teacher_schema(db);migrate_knowledge_schema(db)
    teacher=TeacherAccounts(repo,service).register(username='teacher-qa',password='Admin-QA-2026',display_name='验收教师',school_name='合成测试学校',teaching_classes=['七年级1班'])['user']
    student=service.register_student(username='student-qa',password='Admin-QA-2026',display_name='验收学生',grade='七年级')['user']
    with repo.transaction() as db:
        db.execute("INSERT INTO teacher_student_links(teacher_id,student_id,source,status,linked_at) VALUES(?,?,'test','active','2026-09-28')",(teacher['id'],student['id']))
        db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,created_at,updated_at) VALUES(?,'math','计算：(-3) + 5','2026-09-28','2026-09-28')",(student['id'],))
    knowledge=KnowledgeRepository(path)
    knowledge.create('textbooks',teacher['id'],{'title':'七年级数学（合成验收）','grade':'七年级','edition':'北师大版','semester':'上学期'})
    knowledge.create('questions',teacher['id'],{'prompt':'计算：2 + 3','answer':{'value':5},'explanation':'两个正数相加得到5。','difficulty':'regular','status':'draft'})
    print('隔离管理员/教师/学生和展示资料已创建')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True)
    create(p.parse_args().database)
