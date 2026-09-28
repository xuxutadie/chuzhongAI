"""真实 SQLite 上验证判分、去重和账号边界。"""
import json
import tempfile
import unittest
from pathlib import Path
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.repositories.learning_route_repository import LearningRouteRepository, migrate_learning_schema
from app.services.question_evidence import question_identity, grade_answer, public_question
from app.services.wrong_question_collection import WrongQuestionCollection
from app.services.student_workspace_service import ResourceConflictError, ResourceNotFoundError

QUESTION = {'id':'sample-1','prompt':'2+3=?','options':[{'id':'a','text':'5'},{'id':'b','text':'6'}],
            'answer':'a','response_type':'single-choice','explanation':'2+3=5','knowledge_points':['加法']}


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        path = Path(self.folder.name)/'test.db'
        old = StudentWorkspaceRepository(path)
        with old._connection() as db:
            for user_id in (1,2):
                db.execute("INSERT INTO users(id,username,password_hash,display_name,role,created_at) VALUES(?,?,?,'测试','student','2026-09-25')", (user_id,str(user_id),'unused'))
        self.repo = LearningRouteRepository(path)
        self.collection = WrongQuestionCollection(self.repo)
        with self.repo.transaction() as db:
            migrate_learning_schema(db)
            self.assignment = self.collection.assign(db,user_id=1,source='classroom',source_ref='round1/q1',snapshot=QUESTION,context={})

    def tearDown(self):
        self.folder.cleanup()

    def record(self, key, answer, user=1):
        with self.repo.transaction() as db:
            return self.collection.record(db,user_id=user,event_key=key,assignment_id=self.assignment,answer=answer,occurred_at='2026-09-25T01:00:00+00:00')

    def test_grading_and_identity(self):
        self.assertEqual(grade_answer(QUESTION, 'b'), 'wrong')
        self.assertEqual(grade_answer(QUESTION, None), 'skipped')
        self.assertEqual(grade_answer({**QUESTION,'answer':None},'b'), 'unverified')
        self.assertNotIn('answer',public_question(QUESTION))
        self.assertNotIn('explanation',public_question(QUESTION))
        shuffled = {**QUESTION,'options':list(reversed(QUESTION['options']))}
        self.assertEqual(question_identity(QUESTION),question_identity(shuffled))
        self.assertNotEqual(question_identity(QUESTION),question_identity({**QUESTION,'prompt':'3+3=?'}))

    def test_retry_once_new_wrong_twice_then_correct_preserves(self):
        first = self.record('one','b')
        self.assertEqual(first,self.record('one','b'))
        self.record('two','b')
        self.record('three','a')
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT wrong_count FROM wrong_question_learning').fetchone()[0],2)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM question_answer_events').fetchone()[0],3)

    def test_retry_changed_answer_rejected(self):
        self.record('one','b')
        with self.assertRaises(ResourceConflictError):
            self.record('one','a')

    def test_wrong_owner_and_skip(self):
        with self.assertRaises(ResourceNotFoundError):
            self.record('one','b',2)
        self.record('skip',None)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],0)

    def test_suppression_does_not_resurrect(self):
        first = self.record('one','b')
        with self.repo.transaction() as db:
            self.collection.suppress(db,1,first['collection_id'])
        self.record('two','b')
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT suppressed FROM wrong_question_learning').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],0)

    def test_failure_rolls_back_event_and_card(self):
        with self.assertRaises(RuntimeError):
            with self.repo.transaction() as db:
                self.collection.record(db,user_id=1,event_key='broken',assignment_id=self.assignment,answer='b',occurred_at='2026-09-25')
                raise RuntimeError('回滚')
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM question_answer_events').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],0)

    def test_old_delete_api_keeps_suppression(self):
        first=self.record('one','b')
        old=StudentWorkspaceRepository(self.repo.path)
        self.assertTrue(old.delete_wrong_question(user_id=1,question_id=first['collection_id']))
        self.record('two','b')
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT suppressed FROM wrong_question_learning').fetchone()[0],1)
