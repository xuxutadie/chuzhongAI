import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from education_test_support import EducationFixture
from app.education.grants import StudentGrants
from app.education.policy import require_history
from app.education.errors import EducationError
from app.education.service import EducationSpaces
from app.admin_workspace.accounts import AdminAccounts


class GrantTests(EducationFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.context = self.seed_space()
        self.teacher_grants = StudentGrants(self.repo, self.teacher_identity)
        self.student_grants = StudentGrants(self.repo, self.student_identity)

    def rejected(self, status, action):
        with self.assertRaises(EducationError) as result: action()
        self.assertEqual(result.exception.status_code, status)

    def invite(self, context=None):
        return self.teacher_grants.invite(context or self.context, self.request(student_id=self.student))

    def consent(self, invite):
        return self.request(token=invite['token'], consent=True)

    def test_confirmation_requires_bound_student_and_explicit_consent(self):
        invite = self.invite()
        self.rejected(403, lambda: self.teacher_grants.confirm(self.consent(invite)))
        payload = self.consent(invite)
        self.rejected(422, lambda: self.student_grants.confirm(payload | {'consent': False}))
        self.rejected(422, lambda: self.student_grants.confirm(payload | {'consent': 'true'}))
        preview = self.student_grants.preview(invite['token'])
        self.assertEqual(preview['scope'], 'all_learning_history_read')
        self.assertIn('新增', preview['notice'])
        self.assertIn('只读', preview['notice'])
        grant = self.student_grants.confirm(payload)
        self.assertEqual(grant['student_id'], self.student)
        self.assertEqual(grant['state'], 'active')
        with self.repo.read() as db:
            self.assertEqual(require_history(db, self.teacher_identity, self.context, self.student)['id'], grant['id'])
            self.assertNotIn(invite['token'], repr([tuple(r) for r in db.execute('SELECT * FROM education_history_invitations')]))

    def test_other_student_cannot_preview_or_confirm(self):
        auth = self.workspace.register_student(username='another-student', password=self.password, display_name='另一学生')
        other = StudentGrants(self.repo, self.identity(auth))
        invite = self.invite()
        self.rejected(404, lambda: other.preview(invite['token']))
        self.rejected(404, lambda: other.confirm(self.consent(invite)))

    def test_scoped_grants_and_revoke_do_not_affect_other_school(self):
        other_context = self.seed_space()
        a = self.student_grants.confirm(self.consent(self.invite()))
        b = self.student_grants.confirm(self.consent(self.invite(other_context)))
        self.assertEqual(len(self.student_grants.list_mine()), 2)
        self.student_grants.revoke(a['id'], self.request(expected_revision=1))
        with self.repo.read() as db:
            self.rejected(404, lambda: require_history(db, self.teacher_identity, self.context, self.student))
            self.assertEqual(require_history(db, self.teacher_identity, other_context, self.student)['id'], b['id'])
        self.assertEqual(len(self.student_grants.list_mine()), 2)

    def test_retry_does_not_resurrect_revoke_and_old_invite_cannot_reauthorize(self):
        first, spare = self.invite(), self.invite()
        payload = self.consent(first)
        grant = self.student_grants.confirm(payload)
        self.assertEqual(self.student_grants.confirm(payload)['id'], grant['id'])
        self.rejected(409, lambda: self.student_grants.confirm(self.consent(first)))
        self.student_grants.revoke(grant['id'], self.request(expected_revision=1))
        self.rejected(409, lambda: self.student_grants.confirm(payload))
        self.rejected(404, lambda: self.student_grants.confirm(self.consent(spare)))
        fresh = self.invite()
        renewed = self.student_grants.confirm(self.consent(fresh))
        self.assertEqual(renewed['id'], grant['id'])
        self.assertEqual(renewed['revision'], 3)

    def test_revocation_checks_revision_and_ownership(self):
        grant = self.student_grants.confirm(self.consent(self.invite()))
        self.rejected(403, lambda: self.teacher_grants.revoke(grant['id'], self.request(expected_revision=1)))
        self.rejected(409, lambda: self.student_grants.revoke(grant['id'], self.request(expected_revision=2)))
        auth = self.workspace.register_student(username='other-student', password=self.password, display_name='其他')
        self.rejected(404, lambda: StudentGrants(self.repo, self.identity(auth)).revoke(grant['id'], self.request(expected_revision=1)))

    def test_expired_invite_and_revoked_session_cannot_confirm(self):
        invite = self.invite()
        with self.repo.transaction() as db:
            db.execute("UPDATE education_history_invitations SET expires_at='2000-01-01T00:00:00+00:00'")
        self.rejected(404, lambda: self.student_grants.confirm(self.consent(invite)))
        invite = self.invite()
        self.workspace.logout(self.student_auth['access_token'])
        self.rejected(401, lambda: self.student_grants.confirm(self.consent(invite)))

    def test_disabled_teacher_account_restoration_requires_fresh_consent(self):
        grant = self.student_grants.confirm(self.consent(self.invite()))
        unused = self.invite()
        accounts = AdminAccounts(self.repo)
        disabled = accounts.change_state(self.actor, self.teacher, self.payload(action='disable', expected_revision=1))
        accounts.change_state(self.actor, self.teacher, self.payload(action='enable', expected_revision=disabled['revision']))
        self.rejected(404, lambda: self.student_grants.confirm(self.consent(unused)))
        auth = self.workspace.login(username='teacher-one', password=self.password)
        with self.repo.read() as db:
            member = db.execute('SELECT revision FROM education_memberships WHERE id=?', (self.context.membership_id,)).fetchone()
            context = replace(self.context, membership_revision=member['revision'])
            self.rejected(404, lambda: require_history(db, self.identity(auth), context, self.student))
            self.assertEqual(db.execute('SELECT state FROM education_student_grants WHERE id=?', (grant['id'],)).fetchone()[0], 'revoked')

    def test_teacher_removal_from_school_revokes_and_blocks_pending_invites(self):
        school_admin_context = self.seed_space(user_id=self.actor, role='school_admin')
        # 为同一个学校构造另一名教师，而非根据同名学校推断关联。
        with self.repo.transaction() as db:
            db.execute('UPDATE education_memberships SET space_id=? WHERE id=?', (school_admin_context.space_id, self.context.membership_id))
        context = replace(self.context, space_id=school_admin_context.space_id)
        self.student_grants.confirm(self.consent(self.invite(context)))
        invite = self.invite(context)
        admin = EducationSpaces(self.repo, self.admin_identity)
        admin.set_member_state(school_admin_context, context.membership_id, self.request(state='disabled', expected_revision=1))
        admin.set_member_state(school_admin_context, context.membership_id, self.request(state='active', expected_revision=2))
        self.rejected(404, lambda: self.student_grants.confirm(self.consent(invite)))
        with self.repo.read() as db:
            self.rejected(404, lambda: require_history(db, self.teacher_identity, replace(context, membership_revision=3), self.student))

    def test_simultaneous_confirmation_has_one_grant_and_one_audit_event(self):
        data = self.consent(self.invite())
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.student_grants.confirm(data), range(2)))
        self.assertEqual(results[0]['id'], results[1]['id'])
        self.assertEqual([r['revision'] for r in results], [1, 1])
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM education_student_grants').fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT count(*) FROM education_events WHERE kind='history_confirmed'").fetchone()[0], 1)

    def test_student_role_change_invalidates_existing_and_pending_grants(self):
        grant = self.student_grants.confirm(self.consent(self.invite()))
        self.invite()
        AdminAccounts(self.repo).update_account(self.actor, self.student, self.payload(
            expected_revision=1, username='student-one', display_name='学生', role='teacher', grade=None))
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT state FROM education_student_grants WHERE id=?', (grant['id'],)).fetchone()[0], 'revoked')
            self.assertEqual(db.execute("SELECT count(*) FROM education_history_invitations WHERE state='pending'").fetchone()[0], 0)


if __name__ == '__main__': unittest.main()
