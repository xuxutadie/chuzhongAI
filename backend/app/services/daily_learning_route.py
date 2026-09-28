"""五步按服务端证据推进；与旧自由学习的单知识点循环分开。"""
import json
from datetime import datetime, timedelta, timezone
from app.services.question_catalog import PACKAGES, route_questions
from app.services.question_evidence import encode, public_question
from app.services.wrong_question_collection import WrongQuestionCollection, utc_now
from app.services.student_workspace_service import ResourceConflictError, ResourceNotFoundError, CourseContextRequiredError

TITLES = ['课堂诊断','针对学习','过关测试','错题巩固','今日总结']


def study_date(now):
    if now.tzinfo is None:
        raise ValueError('需要带时区的时间')
    return now.astimezone(timezone(timedelta(hours=8))).date().isoformat()


class DailyLearningRoute:
    def __init__(self, repository, clock=None):
        self.repository = repository
        self.collection = WrongQuestionCollection(repository)
        self.clock = clock or (lambda:datetime.now(timezone.utc))

    def _row(self, db, user_id):
        return db.execute('SELECT * FROM daily_learning_routes WHERE user_id=? AND study_date=?',(user_id,study_date(self.clock()))).fetchone()

    def _view(self,row):
        state = json.loads(row['state_json']) if row else {'steps':[{'status':'available' if i==0 else 'locked'} for i in range(5)]}
        current = next((i+1 for i,s in enumerate(state['steps']) if s['status'] not in ('completed','not_required')),None)
        return {'date':row['study_date'] if row else study_date(self.clock()),'revision':row['revision'] if row else 0,
                'course':json.loads(row['course_snapshot_json']) if row else None,'current_step':current,
                'steps':[dict(s,step=i+1,title=TITLES[i]) for i,s in enumerate(state['steps'])], 'started':bool(row)}

    def view(self,user_id):
        with self.repository.read() as db:
            return self._view(self._row(db,user_id))

    def start(self,user_id,request_id):
        with self.repository.transaction() as db:
            row=self._row(db,user_id)
            if row:
                return self._view(row)
            context=db.execute('SELECT * FROM student_course_context WHERE user_id=?',(user_id,)).fetchone()
            if not context:
                raise CourseContextRequiredError()
            ids=json.loads(context['knowledge_point_ids_json'])
            chapter=context['chapter_id']
            date=study_date(self.clock())
            legacy=db.execute("SELECT * FROM daily_tasks WHERE user_id=? AND task_date=? AND task_id='math-shapes-diagnosis'",(user_id,date)).fetchone()
            if legacy and legacy['course_context_json'] and legacy['status'] in ('in_progress','completed'):
                frozen=json.loads(legacy['course_context_json'])
                ids=[point['id'] for point in frozen['knowledge_points']]
                chapter=frozen['chapter_id']
            if not ids or any(k not in PACKAGES or PACKAGES[k]['chapterId']!=chapter for k in ids):
                raise ResourceConflictError('课程内容需要重新确认')
            state={'steps':[{'status':'in_progress' if i==0 else 'locked'} for i in range(5)],'assignments':{},'receipts':{},'test_round':1}
            course={'chapter_id':chapter,'knowledge_point_ids':ids,'titles':[PACKAGES[k]['title'] for k in ids]}
            self._assign(db,user_id,date,state,ids,1)
            legacy=db.execute("SELECT status FROM daily_tasks WHERE user_id=? AND task_date=? AND task_id='math-shapes-diagnosis'",(user_id,date)).fetchone()
            if legacy and legacy['status']=='completed':
                for s in state['steps'][:3]:
                    s.update(status='completed',legacy=True)
                state['steps'][3]['status']='available'
            now=utc_now()
            db.execute('INSERT INTO daily_learning_routes VALUES(?,?,0,?,?,?,?)',(user_id,date,encode(course),encode(state),now,now))
            return self._view(self._row(db,user_id))

    def _assign(self,db,user_id,date,state,ids,step):
        assigned=[]
        for kp in ids:
            for q in route_questions(PACKAGES[kp],retest=step==3):
                ref=f"route:{date}:{step}:{state['test_round']}:{q['id']}"
                aid=self.collection.assign(db,user_id=user_id,source='classroom',source_ref=ref,snapshot=q,context={'date':date,'step':step,'knowledge_point_id':kp})
                assigned.append(aid)
                if q['id'].startswith('ai-route-'):
                    db.execute('INSERT OR IGNORE INTO math_variant_answers(user_id,question_id,correct_answer_json,knowledge_point_id,created_at,updated_at) VALUES(?,?,?,?,?,?)',
                               (user_id,q['id'],encode(q['answer']),kp,utc_now(),utc_now()))
        state['assignments'][str(step)]=assigned

    @staticmethod
    def _require_step(state,step):
        if step not in range(1,6) or any(s['status'] not in ('completed','not_required') for s in state['steps'][:step-1]):
            raise ResourceConflictError('请先完成前一步，再进入这一项')

    def activity(self,user_id,step):
        with self.repository.read() as db:
            row=self._row(db,user_id)
            if not row:
                raise ResourceConflictError('请从学习首页点击开始')
            state=json.loads(row['state_json'])
            self._require_step(state,step)
            questions=[]
            for aid in state['assignments'].get(str(step),[]):
                q=db.execute('SELECT * FROM learning_question_assignments WHERE id=? AND user_id=?',(aid,user_id)).fetchone()
                event=db.execute('SELECT * FROM question_answer_events WHERE assignment_id=? AND user_id=? ORDER BY id DESC LIMIT 1',(aid,user_id)).fetchone()
                questions.append(dict(public_question(json.loads(q['private_snapshot_json'])),assignment_id=aid,
                                      submitted=bool(event),student_answer=json.loads(event['answer_json']) if event else None,
                                      result=event['result'] if event else None))
            course=json.loads(row['course_snapshot_json'])
            guides=[]
            if step in (2,3):
                for kp in course['knowledge_point_ids']:
                    pack=PACKAGES[kp]
                    guide=pack.get('learningGuide',{})
                    guides.append({'id':kp,'title':pack['title'],'lesson_id':pack['lessonId'],
                                   'steps':guide.get('steps') or list(dict.fromkeys(q['explanation'] for q in pack['questions'])),
                                   'pitfalls':guide.get('pitfalls',[])})
            return {'route':self._view(row),'questions':questions,'guides':guides}

    def answer(self,user_id,assignment_id,event_key,answer):
        with self.repository.transaction() as db:
            assigned=db.execute('SELECT * FROM learning_question_assignments WHERE id=? AND user_id=?',(assignment_id,user_id)).fetchone()
            if not assigned:
                raise ResourceNotFoundError('未找到你的题目')
            context=json.loads(assigned['context_json'])
            date=context.get('date')
            row=db.execute('SELECT * FROM daily_learning_routes WHERE user_id=? AND study_date=?',(user_id,date)).fetchone()
            if not row or assigned['source']!='classroom':
                raise ResourceConflictError('题目不属于这次学习路线')
            state=json.loads(row['state_json'])
            step=context['step']
            self._require_step(state,step)
            existing=db.execute('SELECT * FROM question_answer_events WHERE user_id=? AND assignment_id=?',(user_id,assignment_id)).fetchone()
            if existing:
                if existing['answer_json']!=encode(answer):
                    raise ResourceConflictError('本题已经提交，不能覆盖原答案')
                return self.collection._receipt(db,existing)
            if assignment_id not in state['assignments'].get(str(step),[]) or state['steps'][step-1]['status'] in ('completed','not_required'):
                raise ResourceConflictError('题目已结束，请继续当前任务')
            q=json.loads(assigned['private_snapshot_json'])
            options={o['id'] for o in q['options']}
            valid = isinstance(answer,str) and answer in options
            if q['response_type']=='multi-choice':
                valid = isinstance(answer,list) and bool(answer) and all(isinstance(x,str) and x in options for x in answer) and len(set(answer))==len(answer)
            if not valid:
                raise ResourceConflictError('请选择本题提供的答案')
            result=self.collection.record(db,user_id=user_id,event_key=event_key,assignment_id=assignment_id,answer=answer,occurred_at=utc_now())
            db.execute('UPDATE daily_learning_routes SET revision=revision+1,updated_at=? WHERE user_id=? AND study_date=?',(utc_now(),user_id,date))
            return result

    def complete(self,user_id,step,revision,request_id,reflection,responses=None):
        with self.repository.transaction() as db:
            row=self._row(db,user_id)
            if not row:
                raise ResourceConflictError('请先开始今天的任务')
            state=json.loads(row['state_json'])
            if request_id in state['receipts']:
                return self._view(row)
            self._require_step(state,step)
            if state['steps'][step-1]['status'] in ('completed','not_required'):
                return self._view(row)
            if row['revision']!=revision:
                raise ResourceConflictError('进度已更新，请刷新已保存内容后重试')
            course=json.loads(row['course_snapshot_json'])
            if step in (1,3):
                records=[]
                for aid in state['assignments'].get(str(step),[]):
                    event=db.execute('SELECT e.*,a.private_snapshot_json FROM question_answer_events e JOIN learning_question_assignments a ON a.id=e.assignment_id WHERE e.user_id=? AND e.assignment_id=? ORDER BY e.id DESC LIMIT 1',(user_id,aid)).fetchone()
                    if not event or event['result'] in ('skipped','unverified'):
                        raise ResourceConflictError('请完成本轮所有题目，再进入下一步')
                    records.append(event)
                if not records:
                    raise ResourceConflictError('没有已核验的作答记录')
                if step==3:
                    if len(reflection.strip())<8:
                        raise ResourceConflictError('请用至少 8 个字记录本次学习收获')
                    for kp in course['knowledge_point_ids']:
                        group=[e for e in records if kp in json.loads(e['private_snapshot_json'])['knowledge_points']]
                        if len(group)<10 or sum(e['result']=='correct' for e in group)/len(group)<.98:
                            raise ResourceConflictError('本轮尚未过关，请查看讲解后重新测试；原错题已经保留')
                    # 已核验同一门槛的事件，原任务只落一次完成状态，成长值查询仍用旧表。
                    db.execute("UPDATE daily_tasks SET status='completed',completed_at=COALESCE(completed_at,?),reflection=? WHERE user_id=? AND task_date=? AND task_id='math-shapes-diagnosis'",(utc_now(),reflection,user_id,row['study_date']))
            if step==2:
                responses=responses or {}
                if any(len(str(responses.get(k,'' )).strip())<8 for k in course['knowledge_point_ids']):
                    raise ResourceConflictError('请为每个学习内容记录一句自己的理解（至少 8 字）')
                state['learning_responses']=responses
                self._assign(db,user_id,row['study_date'],state,course['knowledge_point_ids'],3)
            if step==4:
                review=db.execute('SELECT plan_json FROM wrong_question_daily_reviews WHERE user_id=? AND study_date=?',(user_id,row['study_date'])).fetchone()
                if not review or any(not g.get('outcome') for g in json.loads(review['plan_json'])):
                    raise ResourceConflictError('请先处理今天安排的错题；已保存内容不会丢失')
            state['steps'][step-1].update(status='completed',completed_at=utc_now())
            if step<5:
                state['steps'][step]['status']='available'
            state['receipts'][request_id]=step
            db.execute('UPDATE daily_learning_routes SET state_json=?,revision=revision+1,updated_at=? WHERE user_id=? AND study_date=?',(encode(state),utc_now(),user_id,row['study_date']))
            return self._view(self._row(db,user_id))

    def retry_test(self,user_id,revision):
        with self.repository.transaction() as db:
            row=self._row(db,user_id)
            if not row or row['revision']!=revision:
                raise ResourceConflictError('请刷新当前学习进度')
            state=json.loads(row['state_json'])
            self._require_step(state,3)
            if state['steps'][2]['status']=='completed':
                raise ResourceConflictError('已通过的测试不需要重做')
            state['test_round']+=1
            self._assign(db,user_id,row['study_date'],state,json.loads(row['course_snapshot_json'])['knowledge_point_ids'],3)
            db.execute('UPDATE daily_learning_routes SET state_json=?,revision=revision+1 WHERE user_id=? AND study_date=?',(encode(state),user_id,row['study_date']))
        return self.activity(user_id,3)
