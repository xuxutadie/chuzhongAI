"""真实 HTTP 入口验证学校身份、学生授权以及旧入口切换。"""
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from education_test_support import EducationFixture
from app.main import app
from app.api.routes.student_workspace import get_student_workspace_service
from app.services.transition_diagnosis import DiagnosisService
from app.education.grants import StudentGrants


class EducationAPITests(EducationFixture, unittest.TestCase):
    def test_legacy_services_are_closed_and_admin_uses_current_grants(self):
        from app.services.teacher_links import TeacherLinks, require_link
        from app.services.student_workspace_service import ResourceConflictError
        from app.admin_workspace.teacher_views import AdminTeacherViews
        from app.repositories.teacher_schema import migrate_teacher_schema
        import sqlite3
        from contextlib import closing
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('BEGIN IMMEDIATE'); migrate_teacher_schema(db); db.commit()
        links = TeacherLinks(self.repo)
        with self.assertRaises(ResourceConflictError): links.issue_code(self.student)
        with self.assertRaises(ResourceConflictError): links.list_for_student(self.student)
        with self.repo.read() as db:
            with self.assertRaises(ResourceConflictError): require_link(db, self.teacher, self.student)
        self.authorize()
        result = AdminTeacherViews(self.repo).students(self.actor, self.teacher)
        self.assertEqual(result['total'], 1)
        self.assertEqual(result['items'][0]['id'], self.student)

    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_student_workspace_service] = lambda: self.workspace
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.context = self.seed_space()
        self.admin_headers = self.headers(self.auth)
        self.student_headers = self.headers(self.student_auth)
        self.teacher_headers = self.headers(self.teacher_auth, self.context)
        # 仅测试副本标记切换；真实库必须由完整迁移工具在验收后写入。
        with self.repo.transaction() as db:
            db.execute('INSERT INTO education_schema_versions VALUES(2)')

    @staticmethod
    def headers(auth, context=None):
        headers = {'Authorization': 'Bearer ' + auth['access_token'],
                   'X-AI-Coach-Expected-User-Id': str(auth['user']['id'])}
        if context:
            headers.update({'X-Education-Space-Id': context.space_id,
                'X-Education-Membership-Id': context.membership_id,
                'X-Education-Space-Revision': str(context.space_revision),
                'X-Education-Membership-Revision': str(context.membership_revision)})
        return headers

    def authorize(self):
        teacher = StudentGrants(self.repo, self.teacher_identity)
        invite = teacher.invite(self.context, self.request(student_id=self.student))
        return StudentGrants(self.repo, self.student_identity).confirm(self.request(token=invite['token'], consent=True))

    def test_auth_missing_migration_and_foreign_context(self):
        base = '/api/v1/education'
        self.assertEqual(self.client.get(base+'/me/spaces').status_code, 401)
        self.assertEqual(self.client.get(base+'/students', headers=self.headers(self.teacher_auth)).status_code, 409)
        self.assertEqual(self.client.get(base+'/students', headers=self.headers(self.student_auth, self.context)).status_code, 404)
        self.assertEqual(self.client.get(base+'/students', headers=self.teacher_headers | {'X-Education-Space-Revision':'2'}).status_code, 409)
        with self.repo.transaction() as db: db.execute('DELETE FROM education_schema_versions WHERE version=2')
        self.assertEqual(self.client.get(base+'/students', headers=self.teacher_headers).status_code, 503)
        self.assertEqual(self.client.get(base+'/status', headers=self.teacher_headers).json()['enabled'], False)

    def test_invite_preview_consent_and_revoke_over_http(self):
        base = '/api/v1/education'
        invite = self.client.post(base+'/history-invitations', headers=self.teacher_headers,
            json=self.request(student_id=self.student))
        self.assertEqual(invite.status_code, 201, invite.text)
        token = invite.json()['token']
        preview = self.client.post(base+'/history-invitations/preview', headers=self.student_headers, json={'token':token})
        self.assertEqual(preview.status_code, 200, preview.text)
        self.assertIn('只读', preview.json()['notice'])
        self.assertIn('no-store', preview.headers['cache-control'])
        denied = self.client.post(base+'/grants', headers=self.teacher_headers, json=self.request(token=token, consent=True))
        self.assertEqual(denied.status_code, 403)
        consent = self.client.post(base+'/grants', headers=self.student_headers, json=self.request(token=token, consent=True))
        self.assertEqual(consent.status_code, 201, consent.text)
        listing = self.client.get(base+'/students', headers=self.teacher_headers)
        self.assertEqual(listing.json()['total'], 1, listing.text)
        revoke = self.client.post(base+'/grants/'+consent.json()['id']+'/revoke', headers=self.student_headers,
            json=self.request(expected_revision=1))
        self.assertEqual(revoke.status_code, 200, revoke.text)
        self.assertEqual(self.client.get(base+f'/students/{self.student}', headers=self.teacher_headers).status_code, 404)

    def test_all_history_is_readonly_and_other_school_needs_separate_grant(self):
        self.authorize()
        diagnosis = DiagnosisService(self.path)
        diagnosis.save_profile(self.student, 0, {'nickname':'学生', 'grade':'七年级','textbook':'北师大','school_name':'其他学校','class_name':'一班'}, True)
        active = diagnosis.start(self.student)
        base = f'/api/v1/education/students/{self.student}'
        result = self.client.get(base+'/assessments/'+active['id'], headers=self.teacher_headers)
        self.assertEqual(result.status_code, 404, result.text)
        diagnosis.submit(self.student, active['id'], 0)
        result = self.client.get(base+'/assessments/'+active['id'], headers=self.teacher_headers)
        self.assertEqual(result.status_code, 200, result.text)
        self.assertIn('report', result.json())
        for sensitive in ('password_hash','api_key','source_file_path','source_version_id'):
            self.assertNotIn(sensitive, result.text)
        other = self.seed_space()
        self.assertEqual(self.client.get(base, headers=self.headers(self.teacher_auth,other)).status_code, 404)
        self.assertEqual(self.client.post(base, headers=self.teacher_headers,json={}).status_code, 405)

    def test_old_claim_and_old_insight_routes_are_closed_after_cutover(self):
        self.authorize()
        for method, path, headers, payload in [
            ('POST','/teacher/claims',self.teacher_headers,{'code':'old-code','request_id':'old'}),
            ('POST','/me/teacher-links/code',self.student_headers,{}),
            ('GET',f'/teacher/linked-students/{self.student}',self.teacher_headers,None),
            ('GET','/me/teacher-links',self.student_headers,None),
        ]:
            result = self.client.request(method,'/api/v1'+path,headers=headers,json=payload)
            self.assertEqual(result.status_code, 410, result.text)
        self.assertEqual(self.client.get(f'/api/v1/admin/views/students/{self.student}',headers=self.admin_headers).status_code,200)

    def test_attachment_checks_consent_after_rendering(self):
        grant = self.authorize()
        diagnosis = DiagnosisService(self.path)
        diagnosis.save_profile(self.student, 0, {'nickname':'学生','grade':'七年级','textbook':'北师大','school_name':'其他学校','class_name':'一班'}, True)
        attempt = diagnosis.start(self.student)
        diagnosis.submit(self.student, attempt['id'], 0)
        path = f'/api/v1/education/students/{self.student}/assessments/{attempt["id"]}/pdf'
        with patch('app.services.transition_pdf.render_report', return_value=b'permitted-pdf'):
            permitted = self.client.get(path, headers=self.teacher_headers)
        self.assertEqual(permitted.status_code, 200, permitted.text)
        self.assertEqual(permitted.content, b'permitted-pdf')
        def revoke_while_rendering(_):
            StudentGrants(self.repo, self.student_identity).revoke(grant['id'],self.request(expected_revision=1))
            return b'private-pdf'
        with patch('app.services.transition_pdf.render_report', side_effect=revoke_while_rendering):
            result = self.client.get(path, headers=self.teacher_headers)
        self.assertEqual(result.status_code,404,result.text)
        self.assertNotIn(b'private-pdf',result.content)

    def test_wrong_question_image_and_statistics_check_student_ownership(self):
        grant=self.authorize()
        other=self.workspace.register_student(username='other-student',password=self.password,display_name='其他学生')['user']['id']
        with self.repo.transaction() as db:
            mine=db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,source_image,created_at,updated_at) VALUES(?,'math','合成题',?,'now','now')",(self.student,b'private-image')).lastrowid
            foreign=db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,source_image,created_at,updated_at) VALUES(?,'math','其他题',?,'now','now')",(other,b'other-image')).lastrowid
        base=f'/api/v1/education/students/{self.student}'
        result=self.client.get(base+'/history?kind=wrong-questions',headers=self.teacher_headers)
        self.assertEqual(result.json()['total'],1)
        self.assertEqual(self.client.get(base+f'/wrong-questions/{mine}/image',headers=self.teacher_headers).content,b'private-image')
        self.assertEqual(self.client.get(base+f'/wrong-questions/{foreign}/image',headers=self.teacher_headers).status_code,404)
        self.assertEqual(self.client.get(base+f'/wrong-questions/{mine}/image').status_code,401)
        from app.services.teacher_insights import TeacherInsights
        original=TeacherInsights.wrong_image
        def revoke_after_read(service,*args):
            result=original(service,*args)
            StudentGrants(self.repo,self.student_identity).revoke(grant['id'],self.request(expected_revision=1))
            return result
        with patch.object(TeacherInsights,'wrong_image',revoke_after_read):
            response=self.client.get(base+f'/wrong-questions/{mine}/image',headers=self.teacher_headers)
        self.assertEqual(response.status_code,404)
        self.assertNotIn(b'private-image',response.content)


if __name__ == '__main__': unittest.main()
