"""学校名册与邀请预览不能变成学情权限。"""
import unittest
from education_test_support import EducationFixture
from app.education.service import EducationSpaces
from app.education.errors import EducationError


class ManagementTests(EducationFixture,unittest.TestCase):
    def test_member_preview_and_roster_require_exact_identity(self):
        admin = EducationSpaces(self.repo,self.admin_identity)
        space = admin.create_space(self.request(name='甲校',kind='school'))
        invite = admin.invite_member(None,self.request(space_id=space['id'],target_id=self.teacher,role='school_admin'))
        teacher = EducationSpaces(self.repo,self.teacher_identity)
        preview = teacher.preview_member(invite['token'])
        self.assertEqual(preview['school_name'],'甲校')
        self.assertEqual(preview['role'],'school_admin')
        with self.assertRaises(EducationError):
            EducationSpaces(self.repo,self.student_identity).preview_member(invite['token'])
        member = teacher.accept_member(self.request(token=invite['token']))
        from app.education.policy import SpaceContext
        context = SpaceContext(space['id'],member['id'],1,1)
        roster = teacher.members(context,space['id'])
        self.assertEqual(roster['total'],1)
        self.assertNotIn('password',str(roster))
        self.assertNotIn('score',str(roster))
        other = self.seed_space()
        with self.assertRaises(EducationError): teacher.members(context,other.space_id)
        with self.assertRaises(EducationError): teacher.members(other,other.space_id)
        self.assertEqual(admin.members(None,space['id'])['total'],1)

    def test_member_role_change_revokes_grants_and_protects_last_admin(self):
        context = self.seed_space(role='school_admin')
        teacher = EducationSpaces(self.repo,self.teacher_identity)
        with self.assertRaises(EducationError):
            teacher.set_member_role(context,context.membership_id,self.request(role='teacher',expected_revision=1))
        from uuid import uuid4
        other = str(uuid4())
        with self.repo.transaction() as db:
            db.execute("INSERT INTO education_memberships(id,space_id,user_id,role,state,revision,created_at,updated_at) VALUES(?,?,?,'school_admin','active',1,'now','now')",(other,context.space_id,self.admin_identity.user_id))
        grant = self.seed_grant(context)
        teacher.set_member_role(context,context.membership_id,self.request(role='teacher',expected_revision=1))
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT state FROM education_student_grants WHERE id=?',(grant,)).fetchone()[0],'revoked')
