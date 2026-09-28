import unittest
import tempfile
from pathlib import Path
from dataclasses import replace
from education_test_support import EducationFixture
from app.education.schema import migrate_education_schema, education_schema_ready
from app.education.policy import require_session, require_context, require_history
from app.education.errors import EducationError


class PolicyTests(EducationFixture, unittest.TestCase):
    def rejected(self, status, action):
        with self.assertRaises(EducationError) as result:
            action()
        self.assertEqual(result.exception.status_code, status)

    def test_migration_is_idempotent_and_preserves_users(self):
        with self.repo.transaction() as db:
            before = [tuple(r) for r in db.execute('SELECT * FROM users')]
            migrate_education_schema(db)
            self.assertTrue(education_schema_ready(db))
            self.assertEqual(before, [tuple(r) for r in db.execute('SELECT * FROM users')])
            self.assertEqual(db.execute('SELECT count(*) FROM education_student_grants').fetchone()[0], 0)

    def test_actual_session_required_not_only_user_id(self):
        with self.repo.read() as db:
            self.assertEqual(require_session(db, self.teacher_identity)['id'], self.teacher)
            self.rejected(401, lambda: require_session(db, replace(self.teacher_identity, token_hash='forged')))
        self.workspace.logout(self.teacher_auth['access_token'])
        with self.repo.read() as db:
            self.rejected(401, lambda: require_session(db, self.teacher_identity))

    def test_space_and_member_identity_cannot_be_substituted(self):
        a, b = self.seed_space(), self.seed_space()
        with self.repo.read() as db:
            self.assertEqual(require_context(db, self.teacher_identity, a)['id'], a.membership_id)
            self.rejected(404, lambda: require_context(db, self.student_identity, a))
            self.rejected(404, lambda: require_context(db, self.teacher_identity, replace(a, space_id=b.space_id)))
            self.rejected(409, lambda: require_context(db, self.teacher_identity, replace(a, membership_revision=2)))

    def test_no_school_role_substitutes_for_student_consent(self):
        teacher, admin = self.seed_space(), self.seed_space(role='school_admin')
        with self.repo.read() as db:
            for context in [teacher, admin]:
                self.rejected(404, lambda: require_history(db, self.teacher_identity, context, self.student))
        grant_id = self.seed_grant(teacher)
        with self.repo.read() as db:
            self.assertEqual(require_history(db, self.teacher_identity, teacher, self.student)['id'], grant_id)
            self.rejected(404, lambda: require_history(db, self.teacher_identity, admin, self.student))
            self.rejected(409, lambda: require_history(db, self.teacher_identity, teacher, self.student, 2))

    def test_disabled_space_and_revoked_grant_are_denied(self):
        context = self.seed_space()
        grant_id = self.seed_grant(context)
        with self.repo.transaction() as db:
            db.execute("UPDATE education_student_grants SET state='revoked',revision=2 WHERE id=?", (grant_id,))
        with self.repo.read() as db:
            self.rejected(404, lambda: require_history(db, self.teacher_identity, context, self.student))
        with self.repo.transaction() as db:
            db.execute("UPDATE education_spaces SET state='disabled' WHERE id=?", (context.space_id,))
        with self.repo.read() as db:
            self.rejected(404, lambda: require_context(db, self.teacher_identity, context))

    def test_missing_schema_fails_closed(self):
        with self.repo.transaction() as db:
            db.execute('DELETE FROM education_schema_versions')
        with self.repo.read() as db:
            self.rejected(503, lambda: require_session(db, self.admin_identity))

    def test_schema_failure_rolls_back_all_new_tables_without_business_changes(self):
        # 在尚未迁移的新副本中模拟迁移后失败；整批新表必须回滚。
        from app.repositories.student_workspace_repository import StudentWorkspaceRepository
        from app.services.student_workspace_service import StudentWorkspaceService
        from app.admin_workspace.schema import migrate_admin_schema
        from app.repositories.teacher_repository import TeacherRepository
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'rollback.db'
            workspace = StudentWorkspaceService(StudentWorkspaceRepository(path))
            workspace.register_student(username='migration-student', password=self.password, display_name='迁移验证')
            repo = TeacherRepository(path)
            with repo.transaction() as db: migrate_admin_schema(db)
            with repo.read() as db: before = list(db.iterdump())
            with self.assertRaises(RuntimeError):
                with repo.transaction() as db:
                    migrate_education_schema(db)
                    raise RuntimeError('模拟升级校验失败')
            with repo.read() as db:
                self.assertFalse(education_schema_ready(db))
                self.assertEqual(before, list(db.iterdump()))
            with repo.transaction() as db: migrate_education_schema(db)
            with repo.read() as db:
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])


if __name__ == '__main__': unittest.main()
