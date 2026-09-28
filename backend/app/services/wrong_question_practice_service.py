"""重练事务：只投放已验证题，原错题永久保留到学生主动删除。"""
import hashlib
import json
from datetime import datetime,timezone,date
from uuid import uuid4
from app.services.question_evidence import encode,public_question
from app.services.wrong_question_collection import WrongQuestionCollection,utc_now
from app.services.wrong_question_queries import ensure_learning,snapshot_and_events
from app.services.wrong_question_practice import build_verified_question,advance_practice,matched_template
from app.services.wrong_question_review import WrongQuestionReview,next_review_date
from app.services.daily_learning_route import study_date
from app.services.student_workspace_service import ResourceConflictError,ResourceNotFoundError


class WrongQuestionPractice:
    def __init__(self,repository,clock=None):
        self.repository=repository
        self.clock=clock or (lambda:datetime.now(timezone.utc))
        self.collection=WrongQuestionCollection(repository)
        self.review=WrongQuestionReview(repository,self.clock)

    def next(self,user_id,question_id,request_id,stage=None):
        with self.repository.transaction() as db:
            learning=ensure_learning(db,user_id,question_id)
            snapshot,events=snapshot_and_events(db,user_id,learning)
            current=learning['stage']
            state=json.loads(learning['state_json'])
            stage=stage or current
            if stage=='challenge' and current not in ('extension','review','mastered'):
                raise ResourceConflictError('通过变式巩固后才可尝试挑战')
            if stage!='challenge' and stage!=current:
                raise ResourceConflictError('请按当前阶段继续学习')
            today=study_date(self.clock())
            if stage!='challenge' and (current=='mastered' or (current=='review' and learning['due_date'] and learning['due_date']>today)):
                return {'status':'scheduled','message':f"本次订正已保存，下次复习：{learning['due_date']}。今天不用继续刷题。" if current=='review' else '已完成间隔复习，原题和记录继续保留；可以选择挑战。'}
            if state.get('needs_help') and state.get('help_date')==today and stage!='challenge':
                self.review.outcome(db,user_id,learning['id'],'needs_help','连续两次错答')
                return {'status':'needs_help','message':'先停一下，回看原题讲解，说说卡在哪里；今天不再追加这一组题。'}
            template=matched_template(snapshot)
            if not template:
                self.review.outcome(db,user_id,learning['id'],'awaiting_verification','当前题型无确定性校验器')
                return {'status':'unavailable','message':'这道题暂不支持自动变式。原题和错答已保留，可先看分析并向老师求助。'}
            if current=='pending_verification':
                return {'status':'unavailable','message':'参考答案尚未核实，暂不自动判分。'}
            if stage=='mastered':
                stage='review'
            pending=db.execute('''SELECT p.*,a.private_snapshot_json,a.context_json FROM wrong_question_practice_items p JOIN learning_question_assignments a ON a.id=p.assignment_id
                WHERE p.user_id=? AND p.learning_id=? AND p.stage=? AND p.frozen=0
                AND NOT EXISTS(SELECT 1 FROM wrong_question_practice_attempts t WHERE t.item_id=p.id)
                ORDER BY p.created_at LIMIT 1''',(user_id,learning['id'],stage)).fetchone()
            if pending:
                if json.loads(pending['context_json']).get('study_date')==today:
                    return self._public(pending,learning['revision'])
                db.execute('UPDATE wrong_question_practice_items SET frozen=1 WHERE id=?',(pending['id'],))
            count=db.execute('SELECT COUNT(*) FROM wrong_question_practice_items WHERE user_id=? AND learning_id=?',(user_id,learning['id'])).fetchone()[0]
            seed=int(hashlib.sha256(f'{user_id}:{learning["id"]}:{count}'.encode()).hexdigest()[:8],16)
            a,b=2+seed%9,2+(seed//11)%9
            parameters={'part':5*(1+seed%3),'total':20} if template=='percentage' else {'a':a,'b':-b if template=='integer_add' else b}
            # 已成功的模型参数建议只能通过同一确定性校验器进入题目。
            job=db.execute("SELECT result_json FROM wrong_question_ai_jobs WHERE user_id=? AND learning_id=? AND kind='generation' AND status='completed' AND evidence_version=? ORDER BY updated_at DESC LIMIT 1",(user_id,learning['id'],learning['evidence_version'])).fetchone()
            mode='reviewed'
            if job:
                suggestion=json.loads(job[0])
                if suggestion.get('template_id')==template:
                    proposed=suggestion.get('parameters',{})
                    try:
                        build_verified_question(template,proposed,stage)
                        parameters=proposed
                        mode='ai-validated'
                    except (ValueError,KeyError,TypeError):
                        pass
            q=build_verified_question(template,parameters,stage)
            # 两次独立辨识必须使用不同参数，不能反复提交模型缓存的同一道题。
            used=set(state.get('independent_hashes',[]))
            if stage=='variant':
                for offset in range(1,100):
                    if hashlib.sha256(encode(parameters).encode()).hexdigest() not in used:
                        break
                    parameters=({'part':5*(1+offset%3),'total':20} if template=='percentage'
                                else {'a':2+offset%9,'b':-(2+offset//9%9) if template=='integer_add' else 2+offset//9%9})
                    mode='reviewed'
                q=build_verified_question(template,parameters,stage)
            item_id=str(uuid4())
            q['id']='practice-'+item_id
            assignment=self.collection.assign(db,user_id=user_id,source='practice',source_ref=item_id,snapshot=q,context={'learning_id':learning['id'],'stage':stage,'mode':mode,'study_date':today})
            parameter_hash=hashlib.sha256(encode(parameters).encode()).hexdigest()
            db.execute('INSERT INTO wrong_question_practice_items(id,user_id,learning_id,assignment_id,stage,validation_status,validator_version,parameters_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
                       (item_id,user_id,learning['id'],assignment,stage,'verified','1',parameter_hash,utc_now()))
            return {'status':'ready','item_id':item_id,'question':public_question(q),'stage':stage,'revision':learning['revision'],'mode':mode}

    @staticmethod
    def _public(row,revision):
        return {'status':'ready','item_id':row['id'],'question':public_question(json.loads(row['private_snapshot_json'])),
                'stage':row['stage'],'revision':revision,'mode':'reviewed','hint_used':bool(row['hint_used'])}

    def hint(self,user_id,item_id):
        with self.repository.transaction() as db:
            item=db.execute('SELECT * FROM wrong_question_practice_items WHERE id=? AND user_id=?',(item_id,user_id)).fetchone()
            if not item:
                raise ResourceNotFoundError('未找到你的练习')
            db.execute('UPDATE wrong_question_practice_items SET hint_used=1 WHERE id=? AND user_id=?',(item_id,user_id))
            return {'hint':'先写出已知量和要求的量，再回想原题用到的运算规则；可以回看原题解析。这次将记录为借助提示完成。'}

    def report_issue(self,user_id,item_id,reason):
        with self.repository.transaction() as db:
            item=db.execute('SELECT * FROM wrong_question_practice_items WHERE id=? AND user_id=?',(item_id,user_id)).fetchone()
            if not item:
                raise ResourceNotFoundError('未找到你的练习')
            db.execute('UPDATE wrong_question_practice_items SET frozen=1 WHERE id=? AND user_id=?',(item_id,user_id))
            self.review.outcome(db,user_id,item['learning_id'],'awaiting_verification',f'题目异议:{item_id}')
        return {'status':'frozen','message':'已暂停本题自动晋级，原作答保留，等待核实。'}

    def submit(self,user_id,item_id,request_id,revision,answer):
        with self.repository.transaction() as db:
            item=db.execute('''SELECT p.*,a.private_snapshot_json,a.context_json FROM wrong_question_practice_items p
                JOIN learning_question_assignments a ON a.id=p.assignment_id WHERE p.id=? AND p.user_id=?''',(item_id,user_id)).fetchone()
            if not item:
                raise ResourceNotFoundError('未找到你的练习')
            previous=db.execute('SELECT t.*,e.answer_json FROM wrong_question_practice_attempts t JOIN question_answer_events e ON e.id=t.event_id WHERE t.user_id=? AND (t.request_id=? OR t.item_id=?)',(user_id,request_id,item_id)).fetchone()
            if previous:
                if previous['item_id']!=item_id or previous['answer_json']!=encode(answer):
                    raise ResourceConflictError('这道题已提交，不能替换原答案')
                return json.loads(previous['state_after_json'])['receipt']
            learning=db.execute('SELECT * FROM wrong_question_learning WHERE id=? AND user_id=? AND suppressed=0',(item['learning_id'],user_id)).fetchone()
            if not learning or learning['revision']!=revision or item['frozen']:
                raise ResourceConflictError('题目或进度已变化，请重新读取')
            before=json.loads(learning['state_json'])
            today=study_date(self.clock())
            if json.loads(item['context_json']).get('study_date')!=today:
                raise ResourceConflictError('已经跨过学习日，请重新读取今天的练习；昨天的记录保留。')
            if item['stage']!='challenge' and item['stage']!=learning['stage']:
                raise ResourceConflictError('这一题属于之前的阶段，请读取当前练习')
            if item['stage']=='review' and learning['due_date'] and learning['due_date']>today:
                raise ResourceConflictError('尚未到复习日期，请按学习节奏继续')
            before['stage']=learning['stage']
            q=json.loads(item['private_snapshot_json'])
            receipt=self.collection.record(db,user_id=user_id,event_key='practice:'+request_id,assignment_id=item['assignment_id'],answer=answer,occurred_at=utc_now())
            independent=not item['hint_used']
            after=advance_practice(before,receipt['result'],independent,item['parameters_hash'],item['stage'])
            today=study_date(self.clock())
            if after.get('needs_help'):
                after['help_date']=today
            passes=learning['review_passes']
            due=learning['due_date']
            last=learning['last_pass_date']
            if item['stage']=='review' and independent and receipt['result']=='correct' and last!=today:
                passes+=1
                last=today
                next_day=next_review_date(date.fromisoformat(today),passes)
                due=next_day.isoformat() if next_day else None
                if passes>=3:
                    after['stage']='mastered'
            elif item['stage']=='review' and receipt['result']=='wrong':
                passes=0
                after['stage']='understanding'
                due=next_review_date(date.fromisoformat(today),0).isoformat()
            elif before['stage']=='extension' and after['stage']=='review':
                due=next_review_date(date.fromisoformat(today),0).isoformat()
            current=db.execute('SELECT revision FROM wrong_question_learning WHERE id=?',(learning['id'],)).fetchone()[0]
            final={'result':receipt['result'],'answer':q['answer'],'explanation':q['explanation'],'stage':after['stage'],
                   'independent':independent,'revision':current+1,'needs_help':after.get('needs_help',False)}
            stored=dict(after,receipt=final)
            db.execute('INSERT INTO wrong_question_practice_attempts(user_id,request_id,item_id,event_id,independent,state_before_json,state_after_json,submitted_at) VALUES(?,?,?,?,?,?,?,?)',
                       (user_id,request_id,item_id,receipt['event_id'],int(independent),encode(before),encode(stored),utc_now()))
            db.execute('UPDATE wrong_question_learning SET stage=?,state_json=?,revision=?,review_passes=?,last_pass_date=?,due_date=? WHERE id=? AND user_id=?',
                       (after['stage'],encode(after),current+1,passes,last,due,learning['id'],user_id))
            if item['stage']!='challenge':
                if after.get('needs_help'):
                    self.review.outcome(db,user_id,learning['id'],'needs_help',str(receipt['event_id']))
                elif independent and receipt['result']=='correct' and (after['stage']!=before['stage'] or item['stage']=='review'):
                    self.review.outcome(db,user_id,learning['id'],'passed',str(receipt['event_id']))
            return final
