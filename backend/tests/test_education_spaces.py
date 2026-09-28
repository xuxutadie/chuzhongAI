import unittest
from unittest.mock import patch
from education_test_support import EducationFixture
from app.education.service import EducationSpaces
from app.education.errors import EducationError


class SpaceTests(EducationFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.admin = EducationSpaces(self.repo, self.admin_identity)
        self.teaching = EducationSpaces(self.repo, self.teacher_identity)

    def rejected(self, status, action):
        with self.assertRaises(EducationError) as result: action()
        self.assertEqual(result.exception.status_code, status)

    def create(self):
        return self.admin.create_space(self.request(name='同名学校', kind='school'))

    def invite(self, space, **fields):
        return self.admin.invite_member(None, self.request(space_id=space['id'], target_id=self.teacher, role='school_admin', **fields))

    def test_only_platform_admin_can_create_and_names_are_not_identity(self):
        self.rejected(403, lambda: self.teaching.create_space(self.request(name='假学校', kind='school')))
        a, b = self.create(), self.create()
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(self.teaching.list_spaces(), [])
        self.assertEqual(len(self.admin.list_spaces()), 2)

    def test_invitation_is_target_bound_hashed_and_single_use(self):
        space = self.create()
        invite = self.invite(space)
        student = EducationSpaces(self.repo, self.student_identity)
        payload = self.request(token=invite['token'])
        self.rejected(404, lambda: student.accept_member(payload))
        accepted = self.teaching.accept_member(payload)
        self.assertEqual(accepted['space_id'], space['id'])
        self.assertEqual(accepted['role'], 'school_admin')
        self.assertEqual(accepted['user_id'], self.teacher)
        self.rejected(409, lambda: self.teaching.accept_member(self.request(token=invite['token'])))
        with self.repo.read() as db:
            values = repr([tuple(r) for r in db.execute('SELECT * FROM education_member_invitations')])
            events = repr([tuple(r) for r in db.execute('SELECT * FROM education_events')])
            self.assertNotIn(invite['token'], values)
            self.assertNotIn(invite['token'], events)
            self.assertEqual(db.execute('SELECT role FROM users WHERE id=?', (self.teacher,)).fetchone()[0], 'teacher')

    def test_invitation_expiry_and_invalid_role_are_rejected(self):
        space = self.create()
        self.rejected(422, lambda: self.admin.invite_member(None, self.request(space_id=space['id'], target_id=self.teacher, role='admin')))
        invite = self.invite(space)
        with self.repo.transaction() as db:
            db.execute("UPDATE education_member_invitations SET expires_at='2000-01-01T00:00:00+00:00'")
        self.rejected(404, lambda: self.teaching.accept_member(self.request(token=invite['token'])))

    def test_other_space_admin_cannot_invite_or_disable_members(self):
        a = self.seed_space(role='school_admin')
        b = self.seed_space(role='teacher')
        self.rejected(404, lambda: self.teaching.invite_member(a, self.request(space_id=b.space_id, target_id=self.student, role='student')))
        self.rejected(404, lambda: self.teaching.set_member_state(a, b.membership_id, self.request(state='disabled', expected_revision=1)))

    def test_revoked_session_and_audit_failure_rollback(self):
        self.workspace.logout(self.auth['access_token'])
        self.rejected(401, lambda: self.create())
        # 故障发生在插入学校后；审计失败必须撤回业务写入。
        auth = self.workspace.login(username='admin-one', password=self.password)
        self.admin = EducationSpaces(self.repo, self.identity(auth))
        with patch('app.education.service.record_event', side_effect=RuntimeError('audit unavailable')):
            with self.assertRaises(RuntimeError): self.create()
        self.assertEqual(self.admin.list_spaces(), [])

    def test_disabling_space_revokes_grants_and_restore_does_not_revive(self):
        context = self.seed_space()
        self.seed_grant(context)
        disabled = self.admin.set_space_state(context.space_id, self.request(state='disabled', expected_revision=1))
        self.assertEqual(disabled['revision'], 2)
        self.admin.set_space_state(context.space_id, self.request(state='active', expected_revision=2))
        with self.repo.read() as db:
            grant = db.execute('SELECT state,revision FROM education_student_grants').fetchone()
            self.assertEqual(tuple(grant), ('revoked', 2))

    def test_state_revision_and_duplicate_request_conflicts(self):
        space = self.create()
        data = self.request(state='disabled', expected_revision=1)
        self.admin.set_space_state(space['id'], data)
        self.rejected(409, lambda: self.admin.set_space_state(space['id'], data))
        self.rejected(409, lambda: self.admin.set_space_state(space['id'], self.request(state='active', expected_revision=1)))


if __name__ == '__main__': unittest.main()
