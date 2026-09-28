from datetime import datetime, timezone
import json
from test_wrong_question_collection import CollectionTests
from app.services.daily_learning_route import DailyLearningRoute, study_date
from app.services.student_workspace_service import ResourceConflictError


class RouteTests(CollectionTests):
    def setUp(self):
        super().setUp()
        with self.repo.transaction() as db:
            db.execute("INSERT INTO student_course_context(user_id,course_id,chapter_id,knowledge_point_ids_json,updated_at) VALUES(1,'nnu-math-g7-upper','g7u-chapter-2',?,'2026-09-25')",(json.dumps(['g7u-c2-rational','g7u-c2-addition']),))
        self.route = DailyLearningRoute(self.repo, clock=lambda:datetime(2026,9,25,2,tzinfo=timezone.utc))

    def test_initial_five_and_locked_steps(self):
        view=self.route.view(1)
        self.assertEqual(len(view['steps']),5)
        self.assertEqual(view['current_step'],1)
        view=self.route.start(1,'start')
        with self.assertRaises(ResourceConflictError):
            self.route.activity(1,3)

    def test_shanghai_midnight(self):
        self.assertEqual(study_date(datetime(2026,9,25,15,59,tzinfo=timezone.utc)),'2026-09-25')
        self.assertEqual(study_date(datetime(2026,9,25,16,tzinfo=timezone.utc)),'2026-09-26')

    def test_incomplete_not_unlock_wrong_answers_still_finish_diagnosis(self):
        view=self.route.start(1,'start')
        questions=self.route.activity(1,1)['questions']
        self.assertGreaterEqual(len(questions),20)
        with self.assertRaises(ResourceConflictError):
            self.route.complete(1,1,view['revision'],'finish','')
        for q in questions:
            answer=q['options'][0]['id']
            self.route.answer(1,q['assignment_id'],f"answer:{q['assignment_id']}",[answer] if q['response_type']=='multi-choice' else answer)
        view=self.route.view(1)
        finished=self.route.complete(1,1,view['revision'],'finish','')
        self.assertEqual(finished['current_step'],2)
        self.assertEqual(self.route.complete(1,1,view['revision'],'finish','')['current_step'],2)
        self.assertNotIn('answer',questions[0])

    def test_unassigned_answer_rejected(self):
        self.route.start(1,'start')
        with self.assertRaises(ResourceConflictError):
            self.route.answer(1,self.assignment,'bad','b')
