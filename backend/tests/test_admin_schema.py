"""管理迁移只能添加状态，不能损坏旧账号和学习数据。"""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import StudentWorkspaceService, AuthenticationError


class AdminSchemaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'test.db'
        self.repo = StudentWorkspaceRepository(self.path)
        self.service = StudentWorkspaceService(self.repo)
        self.service._clear_login_attempts_for_testing()
        self.auth = self.service.register_student(username='student-a', password='password-123', display_name='学生')
        self.uid = self.auth['user']['id']

    def migrate(self):
        from app.admin_workspace.schema import migrate_admin_schema
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
            migrate_admin_schema(db)

    def test_migration_preserves_users_and_is_idempotent(self):
        before = self.repo.get_user_by_id(self.uid)
        self.migrate()
        self.migrate()
        self.assertEqual(before, self.repo.get_user_by_id(self.uid))
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute('SELECT state,revision FROM admin_account_states').fetchall(), [('active', 1)])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_disabled_deleted_and_missing_state_reject_login_and_sessions(self):
        self.migrate()
        for state in ('disabled', 'deleted', None):
            with self.subTest(state=state):
                with closing(sqlite3.connect(self.path)) as db, db:
                    if state:
                        db.execute('UPDATE admin_account_states SET state=?', (state,))
                    else:
                        db.execute('DELETE FROM admin_account_states')
                with self.assertRaises(AuthenticationError):
                    self.service.login(username='student-a', password='password-123')
                with self.assertRaises(AuthenticationError):
                    self.service.get_current_user(self.auth['access_token'])

    def test_new_registration_initializes_state(self):
        self.migrate()
        other = self.service.register_student(username='student-b', password='password-123', display_name='学生乙')
        with closing(sqlite3.connect(self.path)) as db, db:
            self.assertEqual(db.execute('SELECT state FROM admin_account_states WHERE user_id=?', (other['user']['id'],)).fetchone(), ('active',))

    def test_all_existing_registration_paths_initialize_state(self):
        from app.repositories.teacher_schema import migrate_teacher_schema
        from app.repositories.teacher_repository import TeacherRepository
        from app.services.teacher_accounts import TeacherAccounts
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('BEGIN IMMEDIATE');migrate_teacher_schema(db)
        self.migrate()
        admin=self.service.bootstrap_admin(username='admin-later',password='password-123',display_name='管理员')['user']
        teacher=TeacherAccounts(TeacherRepository(self.path),self.service).register(username='teacher-later',password='password-123',display_name='教师',school_name='测试学校',teaching_classes=['一班'])['user']
        batch=self.service.create_students_batch(teacher=admin,students=[{'username':'batch-one','password':'password-123','display_name':'批量学生','grade':None}])
        with closing(sqlite3.connect(self.path)) as db:
            ids=[admin['id'],teacher['id'],batch[0]['id']]
            for uid in ids:
                self.assertEqual(db.execute('SELECT state FROM admin_account_states WHERE user_id=?',(uid,)).fetchone(),('active',))


if __name__ == '__main__':
    unittest.main()
