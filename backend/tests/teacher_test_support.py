"""教师测试共享临时数据库，不读取正式账号或密钥。"""
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.api.routes.student_workspace import get_student_workspace_service
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.teacher_repository import TeacherRepository
from app.repositories.teacher_schema import migrate_teacher_schema
from app.services.student_workspace_service import StudentWorkspaceService


class TeacherFixture:
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'teacher.db'
        self.workspace = StudentWorkspaceService(StudentWorkspaceRepository(self.path))
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('BEGIN IMMEDIATE')
            migrate_teacher_schema(db)
            db.commit()
        self.repo = TeacherRepository(self.path)
        StudentWorkspaceService._clear_registration_attempts_for_testing()
        StudentWorkspaceService._clear_login_attempts_for_testing()
        app.dependency_overrides[get_student_workspace_service] = lambda: self.workspace
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.folder.cleanup()

    def register_teacher(self, username='teacher-one'):
        return self.client.post('/api/v1/auth/register-teacher', json={
            'username': username, 'password': 'teacher-password-123', 'display_name': '王老师',
            'school_name': '实验中学', 'teaching_classes': ['七年级1班'],
        })

    @staticmethod
    def headers(auth):
        return {'Authorization': 'Bearer ' + auth['access_token']}
