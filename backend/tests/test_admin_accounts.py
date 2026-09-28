"""账号变更、审计和会话必须作为一个安全事务。"""
import unittest
from concurrent.futures import ThreadPoolExecutor
from admin_test_support import AdminFixture
from app.admin_workspace.errors import AdminError
from app.services.student_workspace_service import AuthenticationError, AuthenticationRateLimitError


class AdminAccountsTests(AdminFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from app.admin_workspace.accounts import AdminAccounts
        self.service = AdminAccounts(self.repo)

    def test_account_crud_and_restore_preserve_records(self):
        self.workspace.repository.save_workspace_state(self.student, {'note': '保留'})
        for action, revision, expected in [('delete',1,'deleted'),('restore',2,'disabled'),('enable',3,'active')]:
            result = self.service.change_state(self.actor, self.student, self.payload(action=action,expected_revision=revision))
            self.assertEqual(result['state'], expected)
        self.assertEqual(self.workspace.repository.get_workspace_state(self.student)['note'], '保留')
        self.assertEqual(self.service.list_accounts(self.actor)['total'], 2)

    def test_create_edit_and_duplicate_username(self):
        payload = self.payload(username='new-teacher',display_name='王老师',role='teacher',password=self.password,grade=None)
        user = self.service.create_account(self.actor,payload)
        self.assertEqual(user['role'], 'teacher')
        updated = self.service.update_account(self.actor,user['id'],self.payload(expected_revision=1,username='new-name',display_name='李老师',role='teacher',grade=None))
        self.assertEqual(updated['username'], 'new-name')
        with self.assertRaises(AdminError):
            self.service.create_account(self.actor,self.payload(username='new-name',display_name='重复',role='student',password=self.password))
        self.assertNotIn('password_hash', user)

    def test_current_admin_protected(self):
        for action in ('delete','disable'):
            with self.assertRaises(AdminError):
                self.service.change_state(self.actor,self.actor,self.payload(action=action,expected_revision=1))
        with self.assertRaises(AdminError):
            self.service.update_account(self.actor,self.actor,self.payload(expected_revision=1,username='admin-one',display_name='管理员',role='student'))

    def test_password_reset_revokes_sessions(self):
        token = self.workspace.login(username='student-one',password=self.password)['access_token']
        self.service.reset_password(self.actor,self.student,self.payload(expected_revision=1,password='changed-password'))
        with self.assertRaises(AuthenticationError):
            self.workspace.get_current_user(token)
        self.workspace.login(username='student-one',password='changed-password')

    def test_role_change_revokes_sessions_and_preserves_password(self):
        token=self.workspace.login(username='student-one',password=self.password)['access_token']
        before=self.workspace.repository.get_user_by_id(self.student)
        result=self.service.update_account(self.actor,self.student,self.payload(expected_revision=1,username='student-one',display_name='学生',role='admin',grade=None))
        self.assertEqual(result['role'],'admin')
        self.assertEqual(before['password_hash'],self.workspace.repository.get_user_by_id(self.student)['password_hash'])
        with self.assertRaises(AuthenticationError): self.workspace.get_current_user(token)

    def test_repeated_request_not_applied_twice_and_revision_conflicts(self):
        payload = self.payload(action='disable',expected_revision=1)
        first = self.service.change_state(self.actor,self.student,payload)
        self.assertEqual(self.service.change_state(self.actor,self.student,payload),first)
        with self.assertRaises(AdminError):
            self.service.change_state(self.actor,self.student,self.payload(action='enable',expected_revision=1))
        self.assertEqual(self.service.list_events(self.actor)['total'],1)

    def test_audit_failure_rolls_back(self):
        with self.repo.transaction() as db:
            db.execute("CREATE TRIGGER fail_audit BEFORE INSERT ON admin_action_events BEGIN SELECT RAISE(ABORT,'test failure'); END")
        with self.assertRaises(Exception):
            self.service.change_state(self.actor,self.student,self.payload(action='delete',expected_revision=1))
        self.assertEqual(self.service.get_account(self.actor,self.student)['state'],'active')

    def test_invalid_admin_password_is_rate_limited(self):
        for _ in range(20):
            try:
                self.service.change_state(self.actor,self.student,self.payload(admin_password='incorrect',action='disable',expected_revision=1))
            except AuthenticationRateLimitError:
                break
            except AdminError:
                pass
        else:
            self.fail('错误密码必须触发限流')
        self.assertEqual(self.service.get_account(self.actor,self.student)['state'],'active')

    def test_concurrent_admin_changes_revalidate_actor(self):
        other = self.service.create_account(self.actor,self.payload(username='admin-two',display_name='第二管理员',role='admin',password=self.password))
        def disable(pair):
            try:
                self.service.change_state(pair[0],pair[1],self.payload(action='disable',expected_revision=1))
                return True
            except AdminError:
                return False
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(disable, [(self.actor,other['id']),(other['id'],self.actor)]))
        self.assertEqual(sum(results),1)


if __name__ == '__main__': unittest.main()
