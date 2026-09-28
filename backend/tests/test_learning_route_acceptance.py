"""真实数据库端到端验收，不借助客户端正确标记。"""
import json
from datetime import datetime, timezone, timedelta
from test_daily_learning_route import RouteTests
from app.services.wrong_question_practice_service import WrongQuestionPractice
from app.services.wrong_question_review import WrongQuestionReview
from app.services.student_workspace_service import ResourceConflictError


class AcceptanceTests(RouteTests):
    def answer_round(self, step):
        for q in self.route.activity(1, step)['questions']:
            with self.repo.read() as db:
                raw=db.execute('SELECT private_snapshot_json FROM learning_question_assignments WHERE id=?',(q['assignment_id'],)).fetchone()[0]
            self.route.answer(1,q['assignment_id'],'accept:'+q['assignment_id'],json.loads(raw)['answer'])

    def test_five_steps_complete_from_twenty_question_diagnosis(self):
        self.route.start(1,'start')
        self.answer_round(1)
        self.route.complete(1,1,self.route.view(1)['revision'],'one','')
        with self.assertRaises(ResourceConflictError):
            self.route.complete(1,3,self.route.view(1)['revision'],'skip','我已经理解了运算规则')
        responses={k:'我会先判断符号，再比较绝对值。' for k in ('g7u-c2-rational','g7u-c2-addition')}
        self.route.complete(1,2,self.route.view(1)['revision'],'two','',responses)
        self.answer_round(3)
        self.route.complete(1,3,self.route.view(1)['revision'],'three','我理解了运算规则，先判断符号。')
        WrongQuestionReview(self.repo,self.route.clock).start(1)
        self.route.complete(1,4,self.route.view(1)['revision'],'four','')
        final=self.route.complete(1,5,self.route.view(1)['revision'],'five','')
        self.assertIsNone(final['current_step'])
        self.assertTrue(all(s['status'] in ('completed','not_required') for s in final['steps']))

    def make_practice(self):
        with self.repo.transaction() as db:
            aid=self.collection.assign(db,user_id=1,source='classroom',source_ref='accept-integer',context={},
                snapshot={'id':'g7u-c2-addition-q1','prompt':'2+3=?','answer':'5','response_type':'numeric','options':[]})
            record=self.collection.record(db,user_id=1,event_key='accept-integer',assignment_id=aid,answer='6',occurred_at='2026-09-25')
        self.day=datetime(2026,9,25,2,tzinfo=timezone.utc)
        self.practice=WrongQuestionPractice(self.repo,clock=lambda:self.day)
        return record['collection_id']

    def solve(self,qid):
        item=self.practice.next(1,qid,'next')
        with self.repo.read() as db:
            q=json.loads(db.execute('SELECT a.private_snapshot_json FROM learning_question_assignments a JOIN wrong_question_practice_items p ON p.assignment_id=a.id WHERE p.id=?',(item['item_id'],)).fetchone()[0])
        return self.practice.submit(1,item['item_id'],'answer:'+item['item_id'],item['revision'],q['answer'])

    def test_spaced_review_cannot_be_rushed_before_due(self):
        qid=self.make_practice()
        self.assertEqual(self.solve(qid)['stage'],'variant')
        self.solve(qid)
        self.assertEqual(self.solve(qid)['stage'],'extension')
        self.assertEqual(self.solve(qid)['stage'],'review')
        self.assertEqual(self.practice.next(1,qid,'early')['status'],'scheduled')
        self.day+=timedelta(days=1)
        self.assertEqual(self.solve(qid)['stage'],'review')
        self.day+=timedelta(days=1)
        self.assertEqual(self.practice.next(1,qid,'early-again')['status'],'scheduled')
        self.day+=timedelta(days=2)
        self.assertEqual(self.solve(qid)['stage'],'review')
        self.day+=timedelta(days=7)
        self.assertEqual(self.solve(qid)['stage'],'mastered')
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM wrong_questions WHERE id=?',(qid,)).fetchone()[0],1)

    def test_two_variants_never_reuse_same_parameters(self):
        qid=self.make_practice()
        self.solve(qid)
        with self.repo.transaction() as db:
            learning=db.execute('SELECT * FROM wrong_question_learning WHERE wrong_question_id=?',(qid,)).fetchone()
            db.execute("INSERT INTO wrong_question_ai_jobs(id,user_id,learning_id,request_key,kind,evidence_version,status,input_json,result_json,updated_at) VALUES('fixed',1,?,'fixed','generation',?,'completed','{}',?,'2026-09-25')",(learning['id'],learning['evidence_version'],json.dumps({'template_id':'integer_add','parameters':{'a':2,'b':-3}})))
        self.solve(qid)
        self.assertEqual(self.solve(qid)['stage'],'extension')
