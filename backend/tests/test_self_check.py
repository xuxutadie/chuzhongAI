"""自主练习复用可信判分与错题记录，但不触碰每日路线。"""
import json
import unittest
from fastapi.testclient import TestClient
import test_wrong_question_collection as fixtures
from app.main import app
from app.api.routes.student_workspace import get_current_workspace_user, get_student_workspace_service
from app.services.student_workspace_service import StudentWorkspaceService
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.question_catalog import PACKAGES


class SelfCheckTests(unittest.TestCase):
    def setUp(self):
        fixtures.CollectionTests.setUp(self)
        self.user = {'id': 1, 'role': 'student', 'username': '1', 'display_name': '测试'}
        app.dependency_overrides[get_current_workspace_user] = lambda: self.user
        app.dependency_overrides[get_student_workspace_service] = lambda: StudentWorkspaceService(StudentWorkspaceRepository(self.repo.path))
        self.client = TestClient(app)
        self.pack = next(p for p in PACKAGES.values() if any(q['id'] == 'solid-01' for q in p['questions']))

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        fixtures.CollectionTests.tearDown(self)

    def submit(self, **values):
        payload = dict(request_id='attempt-1', knowledge_point_id=self.pack['id'], question_id='solid-01', answer='b')
        return self.client.post('/api/v1/me/learning/self-check/answers', json={**payload, **values})

    def test_wrong_answer_collects_once_and_keeps_daily_tables_unchanged(self):
        tables = ['daily_tasks', 'daily_learning_routes', 'student_course_context', 'workspace_states']
        with self.repo.read() as db:
            before = {t: [tuple(r) for r in db.execute(f'SELECT * FROM {t}')] for t in tables}
        first = self.submit()
        self.assertEqual(first.status_code, 200, first.text)
        result = first.json()
        self.assertEqual(result['result'], 'wrong')
        self.assertEqual(result['answer'], 'a')
        self.assertTrue(result['explanation'])
        self.assertIsInstance(result['collection_id'], int)
        self.assertEqual(self.submit().json(), result)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM question_answer_events').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0], 1)
            self.assertEqual(db.execute('SELECT wrong_count FROM wrong_question_learning').fetchone()[0], 1)
            for table in tables:
                self.assertEqual([tuple(r) for r in db.execute(f'SELECT * FROM {table}')], before[table])
        rows = self.client.get('/api/v1/me/learning/collection?source=self_check').json()['items']
        self.assertEqual(rows[0]['id'], result['collection_id'])

    def test_correct_then_wrong_then_correct_preserves_original_mistake(self):
        response = self.submit(answer='a')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIsNone(response.json()['collection_id'])
        wrong = self.submit(request_id='attempt-2').json()
        corrected = self.submit(request_id='attempt-3', answer='a').json()
        self.assertEqual(corrected['result'], 'correct')
        self.assertEqual(corrected['collection_id'], wrong['collection_id'])
        detail = self.client.get(f"/api/v1/me/learning/collection/{wrong['collection_id']}").json()
        self.assertEqual(detail['stage'], 'understanding')
        self.assertEqual([e['result'] for e in detail['events']], ['wrong', 'correct'])

    def test_retry_cannot_replace_question_or_answer(self):
        self.assertEqual(self.submit().status_code, 200)
        self.assertEqual(self.submit(answer='a').status_code, 409)
        self.assertEqual(self.submit(question_id='solid-02').status_code, 409)

    def test_invalid_and_forged_answers_do_not_write(self):
        for answer in ['', 'not-an-option', ['a'], ['a', 'a']]:
            self.assertIn(self.submit(answer=answer).status_code, [409, 422])
        self.assertEqual(self.submit(correct=True).status_code, 422)
        self.assertEqual(self.submit(user_id=2).status_code, 422)
        self.assertEqual(self.submit(question_id='unknown').status_code, 404)
        self.assertEqual(self.submit(knowledge_point_id='unknown').status_code, 404)
        self.assertEqual(self.submit(question_id='solid-09').status_code, 409)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM question_answer_events').fetchone()[0], 0)

    def test_same_request_id_is_isolated_between_accounts(self):
        response = self.submit()
        self.assertEqual(response.status_code, 200, response.text)
        first = response.json()
        self.user = {'id': 2, 'role': 'student', 'username': '2', 'display_name': '测试2'}
        second = self.submit().json()
        self.assertNotEqual(first['collection_id'], second['collection_id'])
        self.assertEqual(self.client.get(f"/api/v1/me/learning/collection/{first['collection_id']}").status_code, 404)

    def test_multi_choice_and_true_false_use_reviewed_answer(self):
        for kind in ('multi-choice', 'true-false'):
            pack, q = next((p, q) for p in PACKAGES.values() for q in p['questions'] if q['responseType'] == kind)
            answer = list(reversed(q['correctAnswer'])) if kind == 'multi-choice' else q['correctAnswer']
            result = self.submit(request_id=kind, knowledge_point_id=pack['id'], question_id=q['id'], answer=answer)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(result.json()['result'], 'correct')
            if kind == 'multi-choice':
                self.assertEqual(self.submit(request_id='duplicate', knowledge_point_id=pack['id'], question_id=q['id'], answer=[answer[0], answer[0]]).status_code, 409)
