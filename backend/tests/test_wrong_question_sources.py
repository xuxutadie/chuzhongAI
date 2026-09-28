import json
from unittest.mock import patch
from test_wrong_question_collection import CollectionTests
from app.services.transition_diagnosis import DiagnosisService


class SourceTests(CollectionTests):
    def prepare(self):
        service = DiagnosisService(self.repo.path, collector=self.collection)
        service.save_profile(1,0,{'nickname':'测试','grade':'六年级','textbook':'人教版','school_name':'学校','class_name':'一班'},True)
        attempt = service.start(1)
        with service.connection() as db:
            paper = json.loads(db.execute('SELECT paper_json FROM diagnosis_attempts WHERE id=?',(attempt['id'],)).fetchone()[0])
        q = paper[0]
        wrong = next(x for x in q['options'] if x != q['answer'])
        saved = service.save_answers(1,attempt['id'],0,{q['id']:wrong},{})
        return service,saved

    def test_submission_collects_once_and_not_before(self):
        service,attempt = self.prepare()
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],0)
        submitted = service.submit(1,attempt['id'],attempt['revision'])
        again = service.submit(1,attempt['id'],submitted['revision'])
        self.assertEqual(submitted['report'],again['report'])
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT wrong_count FROM wrong_question_learning').fetchone()[0],1)

    def test_collection_failure_rolls_back_submission(self):
        service,attempt = self.prepare()
        with patch.object(self.collection,'collect_submitted_attempt',side_effect=RuntimeError('写入中断')):
            with self.assertRaises(RuntimeError):
                service.submit(1,attempt['id'],attempt['revision'])
        self.assertEqual(service.get_attempt(1,attempt['id'])['status'],'active')

    def test_backfill_idempotent_and_account_scoped(self):
        service,attempt = self.prepare()
        service.collector = None
        service.submit(1,attempt['id'],attempt['revision'])
        result = self.collection.backfill(1,None,200)
        self.assertEqual(result['added'],1)
        self.assertEqual(self.collection.backfill(1,None,200)['added'],0)
        self.assertEqual(self.collection.backfill(2,None,200)['added'],0)
from app.repositories.student_workspace_repository import StudentWorkspaceRepository


class LiveDraftCollectionTests(CollectionTests):
    def test_saved_free_practice_collects_wrong_ignores_client_correct_flag(self):
        from app.services.question_catalog import PACKAGES
        pack=PACKAGES['g7u-c2-addition']
        q=pack['questions'][0]
        correct=q.get('correctAnswer',q.get('answer'))
        wrong=next(o['id'] for o in q['options'] if o['id']!=correct)
        state={'mathSessions':{'2026-09-25':{'id':'free-session','answers':[
            {'questionId':q['id'],'answer':wrong,'round':1,'answeredAt':'2026-09-25','correct':True}
        ]}}}
        old=StudentWorkspaceRepository(self.repo.path)
        old.save_workspace_state(1,state)
        old.save_workspace_state(1,state)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions WHERE user_id=1').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM question_answer_events WHERE user_id=1').fetchone()[0],1)
