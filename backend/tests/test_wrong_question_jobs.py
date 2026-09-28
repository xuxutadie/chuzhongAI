import json
import unittest
from app.services.wrong_question_jobs import analysis_input, validate_analysis
from test_wrong_question_collection import CollectionTests
from app.services.wrong_question_jobs import WrongQuestionJobs
from app.services.wrong_question_practice_service import WrongQuestionPractice
from app.services.wrong_question_review import WrongQuestionReview


class AnalysisTests(unittest.TestCase):
    def test_identity_removed_actual_answer_kept(self):
        value=analysis_input({'prompt':'2+3=?','answer':'5','username':'secret'},
            [{'id':1,'answer':'6','result':'wrong','steps':None,'display_name':'学生姓名'}],2)
        self.assertNotIn('secret',json.dumps(value,ensure_ascii=False))
        self.assertNotIn('学生姓名',json.dumps(value,ensure_ascii=False))
        self.assertEqual(value['events'][0]['answer'],'6')

    def test_unfounded_model_claim_downgraded(self):
        value=validate_analysis({'possible_causes':[{'claim':'粗心','evidence_event_ids':[999],'confidence':'certain'}]},[1])
        self.assertEqual(value['possible_causes'],[])
        self.assertTrue(value['clarifying_question'])


class DurableJobTests(CollectionTests):
    def test_new_correct_answer_invalidates_old_analysis(self):
        first=self.record('wrong-before-analysis','b')
        jobs=WrongQuestionJobs(self.repo)
        job=jobs.request(1,first['collection_id'],'analysis','analysis-before-correct')
        self.record('correct-after-analysis','a')
        jobs.run_one(runner=lambda *_:{'observed_facts':['旧证据']})
        self.assertEqual(jobs.get(1,job['job_id'])['status'],'stale')

    def test_deleted_question_cannot_receive_late_ai_text(self):
        first=self.record('wrong-before-delete','b')
        jobs=WrongQuestionJobs(self.repo)
        job=jobs.request(1,first['collection_id'],'analysis','analysis-before-delete')
        def delete_during_request(*_):
            with self.repo.transaction() as db:
                self.collection.suppress(db,1,first['collection_id'])
            return {'observed_facts':['本应删除的分析']}
        jobs.run_one(runner=delete_during_request)
        self.assertIsNone(jobs.get(1,job['job_id'])['public_result'])

    def test_worker_retries_twice_and_private_input(self):
        record=self.record('initial','b')
        jobs=WrongQuestionJobs(self.repo)
        first=jobs.request(1,record['collection_id'],'analysis','same')
        self.assertEqual(first['job_id'],jobs.request(1,record['collection_id'],'analysis','same')['job_id'])
        def broken(payload,kind,user_id):
            raise ValueError('模型失败，不能在页面暴露原文')
        jobs.run_one(runner=broken)
        jobs.run_one(runner=broken)
        self.assertFalse(jobs.run_one(runner=broken))
        self.assertEqual(jobs.get(1,first['job_id'])['status'],'failed')
        with self.assertRaises(Exception):
            jobs.get(2,first['job_id'])

    def test_practice_saved_once_and_daily_queue_frozen(self):
        with self.repo.transaction() as db:
            q={'id':'g7u-c2-addition-test','prompt':'计算2+3','answer':'5','response_type':'numeric','options':[]}
            aid=self.collection.assign(db,user_id=1,source='classroom',source_ref='integer',snapshot=q,context={})
            record=self.collection.record(db,user_id=1,event_key='integer',assignment_id=aid,answer='6',occurred_at='2026-09-25')
        practice=WrongQuestionPractice(self.repo)
        reviews=WrongQuestionReview(self.repo)
        plan=reviews.start(1)
        first=practice.next(1,record['collection_id'],'one')
        self.assertEqual(first['item_id'],practice.next(1,record['collection_id'],'two')['item_id'])
        with self.repo.read() as db:
            raw=db.execute('SELECT a.private_snapshot_json FROM learning_question_assignments a JOIN wrong_question_practice_items p ON p.assignment_id=a.id WHERE p.id=?',(first['item_id'],)).fetchone()[0]
        answer=json.loads(raw)['answer']
        submitted=practice.submit(1,first['item_id'],'submit',first['revision'],answer)
        self.assertEqual(submitted['stage'],'variant')
        self.assertEqual(submitted,practice.submit(1,first['item_id'],'submit',first['revision'],answer))
        self.assertEqual(len(reviews.start(1)['groups']),len(plan['groups']))
