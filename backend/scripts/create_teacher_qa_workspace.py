"""建立独立验收库，拒绝已有文件，不触碰正式学生库。"""
import argparse
import sqlite3
import sys
from pathlib import Path
from contextlib import closing
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.teacher_schema import migrate_teacher_schema
from app.repositories.learning_route_repository import migrate_learning_schema
from app.services.student_workspace_service import StudentWorkspaceService
from app.services.transition_diagnosis import DiagnosisService

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    path=parser.parse_args().database.resolve()
    if path.exists():
        parser.error('只允许新建验收数据库')
    service=StudentWorkspaceService(StudentWorkspaceRepository(path))
    with closing(sqlite3.connect(path)) as db:
        db.execute('BEGIN IMMEDIATE')
        migrate_teacher_schema(db)
        migrate_learning_schema(db)
        db.commit()
    # 明确标识的合成账号，不包含任何真实学生数据或API配置。
    auth=service.register_student(username='qa-student-926',password='QaTest-926-local',display_name='验收学生（非真实）')
    diagnosis=DiagnosisService(path)
    diagnosis.save_profile(auth['user']['id'],0,{'nickname':'验收学生','grade':'七年级','textbook':'北师大版 七年级上册','school_name':'验收实验学校','class_name':'七年级1班'},True)
    attempt=diagnosis.start(auth['user']['id'])
    diagnosis.submit(auth['user']['id'],attempt['id'],0)
    print('独立验收库已建立；合成学生：qa-student-926；不含真实记录。')
