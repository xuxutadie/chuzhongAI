import json
import unittest
from uuid import uuid4
from admin_test_support import AdminFixture
from app.admin_workspace.errors import AdminError
from app.services.student_workspace_service import ResourceNotFoundError


class AdminStudentViewsTests(AdminFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        from app.admin_workspace.views import AdminStudentViews
        self.views = AdminStudentViews(self.repo)
        with self.repo.transaction() as db:
            self.question = db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,source_image,created_at,updated_at) VALUES(?,'math','1+1=?',?,'today','today')",(self.student,b'image')).lastrowid

    def test_admin_reads_unlinked_student_and_no_business_writes(self):
        with self.repo.read() as db: before=list(db.iterdump())
        overview=self.views.overview(self.actor,self.student)
        self.assertEqual(overview['profile']['display_name'],'学生')
        for kind in ('learning','assessments','reports','wrong-questions'):
            self.views.history(self.actor,self.student,kind)
        self.assertEqual(self.views.wrong_image(self.actor,self.student,self.question)[0],b'image')
        with self.repo.read() as db: self.assertEqual(before,list(db.iterdump()))
        with self.assertRaises(AdminError): self.views.overview(self.student,self.actor)

    def test_promoted_deleted_and_disabled_accounts_keep_history(self):
        with self.repo.transaction() as db:
            db.execute("UPDATE users SET role='admin' WHERE id=?",(self.student,))
            db.execute("UPDATE admin_account_states SET state='deleted' WHERE user_id=?",(self.student,))
        self.assertEqual(self.views.wrong_question(self.actor,self.student,self.question)['question_text'],'1+1=?')
        self.assertEqual(self.views.overview(self.actor,self.student)['profile']['display_name'],'学生')

    def test_nested_ids_must_belong_to_target(self):
        with self.assertRaises(ResourceNotFoundError): self.views.wrong_image(self.actor,self.actor,self.question)
        with self.assertRaises(ResourceNotFoundError): self.views.wrong_question(self.actor,self.actor,self.question)
        with self.assertRaises(ResourceNotFoundError): self.views.assessment(self.actor,self.student,'missing')

    def test_open_view_audit_is_idempotent(self):
        rid=str(uuid4())
        self.views.open_view(self.actor,self.student,'student',rid)
        self.views.open_view(self.actor,self.student,'student',rid)
        with self.repo.read() as db: self.assertEqual(db.execute('SELECT count(*) FROM admin_action_events').fetchone()[0],1)
