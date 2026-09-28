import unittest
from pathlib import Path
from admin_test_support import AdminFixture
from app.services.student_workspace_service import AuthenticationError


class AdminMaintenanceTests(AdminFixture,unittest.TestCase):
    def test_promote_exact_account_only_and_preserve_password(self):
        from scripts.promote_admin_account import promote
        before=self.workspace.repository.get_user_by_id(self.student)
        token=self.workspace.login(username='student-one',password=self.password)['access_token']
        result=promote(self.path,'student-one',self.student,self.path.parent/'backups')
        after=self.workspace.repository.get_user_by_id(self.student)
        self.assertEqual(after['role'],'admin')
        self.assertEqual(before['password_hash'],after['password_hash'])
        self.assertEqual(self.workspace.repository.get_user_by_id(self.actor)['role'],'admin')
        self.assertTrue(Path(result['backup']).is_file())
        from scripts.verify_admin_workspace import compare_promotion
        self.assertTrue(compare_promotion(Path(result['backup']),self.path,self.student)['password_preserved'])
        with self.assertRaises(AuthenticationError): self.workspace.get_current_user(token)

    def test_wrong_id_and_dry_run_never_mutate(self):
        from scripts.promote_admin_account import promote
        before=self.workspace.repository.get_user_by_id(self.student)
        with self.assertRaises(ValueError): promote(self.path,'student-one',self.actor,self.path.parent/'backups')
        promote(self.path,'student-one',self.student,self.path.parent/'backups',dry_run=True)
        self.assertEqual(before,self.workspace.repository.get_user_by_id(self.student))

    def test_migration_backup_dry_run_and_verify_copy(self):
        from scripts.migrate_admin_workspace import migrate
        from scripts.verify_admin_workspace import verify
        result=migrate(self.path,self.path.parent/'backups',dry_run=True)
        self.assertTrue(Path(result['backup']).is_file())
        self.assertTrue(verify(self.path)['business_data_preserved'])
        self.assertTrue(verify(self.path,username='student-one',expected_id=self.student)['promotion_rehearsed'])
