"""统一错题收集：事件不可覆盖、题卡去重、用户归属由调用方鉴权。"""
import json
import base64
from datetime import datetime, timezone
from uuid import uuid4
from app.services.question_evidence import encode, normalize_question, question_identity, grade_answer
from app.services.student_workspace_service import ResourceConflictError, ResourceNotFoundError


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class WrongQuestionCollection:
    def __init__(self, repository):
        self.repository = repository

    def assign(self, db, *, user_id, source, source_ref, snapshot, context):
        previous = db.execute('SELECT id FROM learning_question_assignments WHERE user_id=? AND source=? AND source_ref=?', (user_id,source,source_ref)).fetchone()
        if previous:
            return previous['id']
        q = normalize_question(snapshot)
        identity = question_identity(q)
        assignment_id = str(uuid4())
        db.execute('INSERT INTO learning_question_assignments VALUES(?,?,?,?,?,?,?,?,?)',
                   (assignment_id,user_id,source,source_ref,q['id'],identity,encode(q),encode(context),utc_now()))
        return assignment_id

    def record(self, db, *, user_id, event_key, assignment_id, answer, occurred_at):
        previous = db.execute('SELECT * FROM question_answer_events WHERE user_id=? AND event_key=?', (user_id,event_key)).fetchone()
        if previous:
            if previous['assignment_id'] != assignment_id or previous['answer_json'] != encode(answer):
                raise ResourceConflictError('同一次提交不能替换答案，请重新载入')
            return self._receipt(db,previous)
        assigned = db.execute('SELECT * FROM learning_question_assignments WHERE id=? AND user_id=?', (assignment_id,user_id)).fetchone()
        if not assigned:
            raise ResourceNotFoundError('未找到你的题目')
        snapshot = json.loads(assigned['private_snapshot_json'])
        result = grade_answer(snapshot, answer)
        event_id = db.execute('INSERT INTO question_answer_events(user_id,event_key,assignment_id,answer_json,result,occurred_at,received_at) VALUES(?,?,?,?,?,?,?)',
                             (user_id,event_key,assignment_id,encode(answer),result,occurred_at,utc_now())).lastrowid
        context = json.loads(assigned['context_json'])
        # 变式统一挂到母题；不让每道变式占据一张主卡。
        parent = context.get('learning_id')
        if parent:
            learning = db.execute('SELECT * FROM wrong_question_learning WHERE user_id=? AND id=?', (user_id,parent)).fetchone()
        else:
            learning = db.execute('SELECT * FROM wrong_question_learning WHERE user_id=? AND identity_key=?', (user_id,assigned['content_version'])).fetchone()
        if not learning and result in ('wrong','unverified'):
            timestamp = utc_now()
            question_id = db.execute("INSERT INTO wrong_questions(user_id,subject,question_text,knowledge_points_json,created_at,updated_at) VALUES(?,'数学',?,?,?,?)",
                                    (user_id,snapshot['prompt'],encode(snapshot['knowledge_points']),timestamp,timestamp)).lastrowid
            learning_id = db.execute('INSERT INTO wrong_question_learning(user_id,wrong_question_id,identity_key,stage) VALUES(?,?,?,?)',
                                     (user_id,question_id,assigned['content_version'],'understanding' if result=='wrong' else 'pending_verification')).lastrowid
            learning = db.execute('SELECT * FROM wrong_question_learning WHERE id=?', (learning_id,)).fetchone()
        if learning:
            db.execute('INSERT INTO wrong_question_event_links VALUES(?,?,?)', (event_id,learning['id'],'suppressed' if learning['suppressed'] else 'linked'))
            if not learning['suppressed']:
                db.execute('UPDATE wrong_question_learning SET evidence_version=evidence_version+1,revision=revision+1 WHERE id=? AND user_id=?',(learning['id'],user_id))
            if result == 'wrong' and not learning['suppressed']:
                db.execute('UPDATE wrong_question_learning SET wrong_count=wrong_count+1 WHERE id=? AND user_id=?', (learning['id'],user_id))
                if learning['stage']=='mastered' and not parent:
                    state = json.loads(learning['state_json'])
                    state['previous_mastery'] = learning['last_pass_date']
                    db.execute("UPDATE wrong_question_learning SET stage='understanding',review_passes=0,due_date=NULL,state_json=? WHERE id=? AND user_id=?", (encode(state),learning['id'],user_id))
        event = db.execute('SELECT * FROM question_answer_events WHERE id=?', (event_id,)).fetchone()
        return self._receipt(db,event)

    @staticmethod
    def _receipt(db,event):
        link = db.execute('SELECT l.wrong_question_id,l.suppressed FROM wrong_question_learning l JOIN wrong_question_event_links e ON e.learning_id=l.id WHERE e.event_id=? AND l.user_id=?', (event['id'],event['user_id'])).fetchone()
        return {'event_id':event['id'],'result':event['result'], 'collection_id':link['wrong_question_id'] if link and not link['suppressed'] else None}

    def suppress(self, db, user_id, question_id):
        row = db.execute('SELECT id FROM wrong_questions WHERE id=? AND user_id=?',(question_id,user_id)).fetchone()
        if not row:
            raise ResourceNotFoundError('未找到你的错题')
        learning = db.execute('SELECT id FROM wrong_question_learning WHERE wrong_question_id=? AND user_id=?',(question_id,user_id)).fetchone()
        if learning:
            # 固定队列保留原位置，但主动删除的题不再要求作答，也不算掌握。
            for review in db.execute('SELECT study_date,plan_json FROM wrong_question_daily_reviews WHERE user_id=?',(user_id,)).fetchall():
                groups=json.loads(review['plan_json'])
                changed=False
                for group in groups:
                    if group['learning_id']==learning['id'] and not group.get('outcome'):
                        group.update(outcome='not_required',evidence_id='student_deleted')
                        changed=True
                if changed:
                    db.execute('UPDATE wrong_question_daily_reviews SET plan_json=?,revision=revision+1 WHERE user_id=? AND study_date=?',(encode(groups),user_id,review['study_date']))
            db.execute('UPDATE wrong_question_learning SET suppressed=1,state_json=? WHERE id=?', ('{}',learning['id']))
            db.execute("UPDATE wrong_question_ai_jobs SET status='stale',input_json='{}',result_json=NULL WHERE learning_id=? AND user_id=?",(learning['id'],user_id))
            db.execute('UPDATE wrong_question_practice_items SET frozen=1 WHERE learning_id=? AND user_id=?',(learning['id'],user_id))
            # 作答事件也是原课堂/测评的依据；删除集合不删除原活动的学习记录。
            # 集合详情及练习接口通过 suppressed 和原题归属检查禁止继续读取。
        db.execute('DELETE FROM wrong_questions WHERE id=? AND user_id=?',(question_id,user_id))

    def collect_submitted_attempt(self, db, *, user_id, attempt_id):
        row = db.execute("SELECT * FROM diagnosis_attempts WHERE id=? AND user_id=? AND status='submitted'", (attempt_id,user_id)).fetchone()
        if not row:
            raise ResourceNotFoundError('只可收集本人已交卷的测评')
        for q in json.loads(row['paper_json']):
            self._collect_transition_question(db,user_id,row,q)

    def collect_workspace_answers(self, db, user_id, state):
        """自由学习沿用原保存事务；客户端 correct/passed 不能作为判分依据。"""
        from app.services.question_catalog import find_question
        sessions=state.get('mathSessions',{})
        if not isinstance(sessions,dict):
            return
        for session in sessions.values():
            if not isinstance(session,dict):
                continue
            attempts=session.get('answers',[])
            if not isinstance(attempts,list):
                continue
            for attempt in attempts:
                if not isinstance(attempt,dict) or isinstance(attempt.get('answer'),dict):
                    continue
                qid=attempt.get('questionId','')
                snapshot=find_question(qid)
                if not snapshot:
                    continue
                key=f"history:{session.get('id','')}:{qid}:{attempt.get('round')}:{attempt.get('answeredAt','')}"
                if db.execute('SELECT 1 FROM question_answer_events WHERE user_id=? AND event_key=?',(user_id,key)).fetchone():
                    continue
                assigned=self.assign(db,user_id=user_id,source='history',source_ref=key,snapshot=snapshot,context={})
                self.record(db,user_id=user_id,event_key=key,assignment_id=assigned,answer=attempt.get('answer'),occurred_at=attempt.get('answeredAt') or utc_now())

    def _collect_transition_question(self, db, user_id, row, q):
        from app.services.transition_diagrams import corrected_question_display
        q = corrected_question_display(q)
        ref = f"transition:{row['id']}:{q['id']}"
        assigned = self.assign(db,user_id=user_id,source='transition',source_ref=ref,snapshot=q,context={'attempt_id':row['id']})
        return self.record(db,user_id=user_id,event_key=ref,assignment_id=assigned,
                           answer=json.loads(row['answers_json']).get(q['id']),occurred_at=row['submitted_at'])

    def backfill(self, user_id, cursor=None, limit=200):
        limit = min(200,max(1,int(limit)))
        after, upper = '', None
        if cursor:
            try:
                parsed = json.loads(base64.urlsafe_b64decode(cursor.encode()))
                after,upper = parsed['after'],parsed['upper']
                if not isinstance(after,str) or not isinstance(upper,str):
                    raise ValueError()
            except (ValueError,KeyError,TypeError):
                raise ResourceConflictError('补收位置无效，请重新开始')
        result = dict(added=0,existing=0,pending=0,suppressed=0,unrecoverable=0,next_cursor=None)
        with self.repository.transaction() as db:
            sources = []
            if db.execute("SELECT name FROM sqlite_master WHERE name='diagnosis_attempts'").fetchone():
                for row in db.execute("SELECT * FROM diagnosis_attempts WHERE user_id=? AND status='submitted' ORDER BY id",(user_id,)):
                    for index,q in enumerate(json.loads(row['paper_json'])):
                        sources.append((f"a:{row['id']}:{index:04}",'transition',dict(row),q))
            state = db.execute('SELECT state_json FROM workspace_states WHERE user_id=?',(user_id,)).fetchone()
            if state:
                for day,session in json.loads(state['state_json']).get('mathSessions',{}).items():
                    if not isinstance(session,dict):
                        continue
                    for index,attempt in enumerate(session.get('answers',[])):
                        sources.append((f"b:{day}:{session.get('id','')}:{index:05}",'draft',session,attempt))
            sources.sort(key=lambda item:item[0])
            upper = upper or (sources[-1][0] if sources else '')
            batch = [x for x in sources if after < x[0] <= upper][:limit+1]
            for key,source,row,q in batch[:limit]:
                if source == 'transition':
                    event_key = f"transition:{row['id']}:{q['id']}"
                    existed = db.execute('SELECT 1 FROM question_answer_events WHERE user_id=? AND event_key=?',(user_id,event_key)).fetchone()
                    receipt = self._collect_transition_question(db,user_id,row,q)
                else:
                    from app.services.question_catalog import find_question
                    snapshot = find_question(q.get('questionId',''))
                    if snapshot is None:
                        result['unrecoverable'] += 1
                        continue
                    event_key = f"history:{row.get('id','')}:{q.get('questionId')}:{q.get('round')}:{q.get('answeredAt','')}"
                    existed = db.execute('SELECT 1 FROM question_answer_events WHERE user_id=? AND event_key=?',(user_id,event_key)).fetchone()
                    assigned = self.assign(db,user_id=user_id,source='history',source_ref=event_key,snapshot=snapshot,context={})
                    receipt = self.record(db,user_id=user_id,event_key=event_key,assignment_id=assigned,answer=q.get('answer'),occurred_at=q.get('answeredAt') or utc_now())
                if receipt['result'] in ('wrong','unverified'):
                    if existed:
                        result['existing'] += 1
                    elif receipt['collection_id'] is None:
                        result['suppressed'] += 1
                    elif receipt['result']=='unverified':
                        result['pending'] += 1
                    else:
                        result['added'] += 1
            if len(batch)>limit:
                result['next_cursor'] = base64.urlsafe_b64encode(encode({'after':batch[limit-1][0],'upper':upper}).encode()).decode()
        return result
