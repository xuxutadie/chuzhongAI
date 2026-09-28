import json
import unittest
from teacher_test_support import TeacherFixture
from app.services.transition_diagnosis import DiagnosisService
from app.services.teacher_links import TeacherLinks
from app.services.teacher_insights import TeacherInsights
from app.services.student_workspace_service import ResourceNotFoundError


class TeacherInsightsTests(TeacherFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.teacher_auth = self.register_teacher().json()
        self.other_auth = self.register_teacher('teacher-other').json()
        self.teacher = self.teacher_auth['user']['id']
        self.student_auth = self.workspace.register_student(username='test-student', password='password123', display_name='测试学生')
        self.student = self.student_auth['user']['id']
        self.diagnosis = DiagnosisService(self.path)
        self.diagnosis.save_profile(self.student, 0, {'nickname':'小林','grade':'七年级','textbook':'北师大', 'school_name':'实验学校','class_name':'一班'}, True)
        self.attempt = self.diagnosis.start(self.student)
        self.links = TeacherLinks(self.repo)
        self.receipt = self.links.claim(self.teacher, self.links.issue_code(self.student)['code'], 'claim')
        with self.repo.transaction() as db:
            self.question = db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,source_image,created_at,updated_at) VALUES(?,'math','测试题',?,'today','today')", (self.student, b'test-image')).lastrowid
        self.service = TeacherInsights(self.repo)

    def test_reads_have_no_learning_side_effects(self):
        def snapshot():
            with self.repo.read() as db:
                return list(db.iterdump())
        before = snapshot()
        for _ in range(2):
            overview = self.service.overview(self.teacher, self.student)
            self.assertIsNone(overview['latest_assessment'])
            self.assertIsNone(overview['today'])
            for kind in ['learning','assessments','wrong-questions','reports']:
                self.service.history(self.teacher, self.student, kind)
            active = self.service.assessment(self.teacher, self.student, self.attempt['id'])
            self.assertEqual(active['status'], 'active')
            for key in ['answers','paper','report']:
                self.assertIsNone(active.get(key))
            self.service.wrong_question(self.teacher, self.student, self.question)
        self.assertEqual(before, snapshot())

    def test_each_endpoint_auth_and_revoke_files(self):
        base = f'/api/v1/teacher/linked-students/{self.student}'
        paths = ['', '/history?kind=learning', '/history?kind=assessments', '/history?kind=wrong-questions',
                 f'/assessments/{self.attempt["id"]}', f'/assessments/{self.attempt["id"]}/pdf',
                 f'/wrong-questions/{self.question}', f'/wrong-questions/{self.question}/image']
        self.diagnosis.submit(self.student, self.attempt['id'], 0)
        self.assertEqual(self.client.get(base, headers=self.headers(self.teacher_auth)).status_code, 200)
        for path in paths:
            for auth, expected in [(None,401), (self.student_auth,403), (self.other_auth,404)]:
                response = self.client.get(base+path, headers=self.headers(auth) if auth else {})
                self.assertEqual(response.status_code, expected, path)
        image = self.client.get(base+f'/wrong-questions/{self.question}/image', headers=self.headers(self.teacher_auth))
        self.assertEqual(image.content, b'test-image')
        self.assertIn('no-store', image.headers['cache-control'])
        self.links.revoke(self.student, 'student', self.receipt['link_id'])
        for path in paths:
            self.assertEqual(self.client.get(base+path, headers=self.headers(self.teacher_auth)).status_code, 404, path)

    def test_owner_mismatch_and_list_filters(self):
        other_student = self.workspace.register_student(username='other-student', password='password123', display_name='另一个学生')['user']['id']
        self.diagnosis.save_profile(other_student,0,{'nickname':'另一个','grade':'七年级','textbook':'北师大','school_name':'学校','class_name':'二班'},True)
        attempt = self.diagnosis.start(other_student)
        with self.assertRaises(ResourceNotFoundError):
            self.service.assessment(self.teacher, self.student, attempt['id'])
        rows = self.service.students(self.teacher, {'school':'实验学校'})
        self.assertEqual(rows['total'], 1)
        self.assertEqual(rows['items'][0]['class_name'], '一班')
        self.assertEqual(self.service.students(self.teacher, {'school':'其他'})['total'],0)
        self.assertNotIn('password', json.dumps(rows))
