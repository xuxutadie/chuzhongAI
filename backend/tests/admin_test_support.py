"""只使用临时数据库的管理测试工具。"""
import tempfile
from pathlib import Path
from uuid import uuid4
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService
from app.admin_workspace.schema import migrate_admin_schema
from app.admin_workspace.repository import AdminRepository


class AdminFixture:
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.path = Path(folder.name) / 'admin.db'
        self.workspace = StudentWorkspaceService(StudentWorkspaceRepository(self.path))
        self.workspace._clear_login_attempts_for_testing()
        self.password = 'password-123'
        self.auth = self.workspace.bootstrap_admin(username='admin-one', password=self.password, display_name='管理员')
        self.actor = self.auth['user']['id']
        self.repo = AdminRepository(self.path)
        with self.repo.transaction() as db:
            migrate_admin_schema(db)
        self.student = self.workspace.register_student(username='student-one', password=self.password, display_name='学生')['user']['id']

    def payload(self, **kwargs):
        return {'request_id': str(uuid4()), 'admin_password': self.password, **kwargs}
