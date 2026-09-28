import json
from datetime import datetime,timezone,timedelta
from test_learning_route_acceptance import AcceptanceTests
from app.services.wrong_question_review import WrongQuestionReview
from app.services.wrong_question_jobs import WrongQuestionJobs
from app.services.wrong_question_queries import collection_detail
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.services.student_workspace_service import ResourceConflictError


class ReviewFixTests(AcceptanceTests):
    def test_removed_question_no_longer_blocks_frozen_queue(self):
        qid=self.make_practice()
        reviews=WrongQuestionReview(self.repo,clock=lambda:self.day)
        reviews.start(1)
        with self.repo.transaction() as db:
            self.collection.suppress(db,1,qid)
        self.assertEqual(reviews.view(1)['groups'][0]['outcome'],'not_required')

    def test_midnight_submission_cannot_complete_another_day(self):
        qid=self.make_practice()
        reviews=WrongQuestionReview(self.repo,clock=lambda:self.day)
        reviews.start(1)
        item=self.practice.next(1,qid,'before-midnight')
        with self.repo.read() as db:
            q=json.loads(db.execute('SELECT a.private_snapshot_json FROM learning_question_assignments a JOIN wrong_question_practice_items p ON p.assignment_id=a.id WHERE p.id=?',(item['item_id'],)).fetchone()[0])
        self.day+=timedelta(days=1)
        reviews.start(1)
        with self.assertRaises(ResourceConflictError):
            self.practice.submit(1,item['item_id'],'after-midnight',item['revision'],q['answer'])
        self.assertIsNone(reviews.view(1)['groups'][0]['outcome'])
        self.assertNotEqual(self.practice.next(1,qid,'new-day')['item_id'],item['item_id'])

    def test_edit_retires_old_analysis_and_trusted_answer(self):
        qid=self.make_practice()
        jobs=WrongQuestionJobs(self.repo)
        jobs.request(1,qid,'analysis','before-edit')
        jobs.run_one(runner=lambda *_:{'observed_facts':['旧题分析']})
        StudentWorkspaceRepository(self.repo.path).update_wrong_question(user_id=1,question_id=qid,question_text='订正后的另一个题干')
        with self.repo.read() as db:
            detail=collection_detail(db,1,qid)
        self.assertEqual(detail['question']['prompt'],'订正后的另一个题干')
        self.assertIsNone(detail['question']['answer'])
        self.assertIsNone(detail['analysis'])
        self.assertEqual(detail['stage'],'pending_verification')
