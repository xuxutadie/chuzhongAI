"""本日固定队列与独立的间隔复习计数。"""
import json
from datetime import date, timedelta, datetime, timezone
from app.services.daily_learning_route import study_date
from app.services.question_evidence import encode
from app.services.wrong_question_collection import utc_now


def daily_limit(minutes):
    if type(minutes) is not int or minutes<=0:
        return 2
    return min(3,max(1,minutes//10))


def next_review_date(day,completed_reviews):
    return day+timedelta(days=(1,3,7)[completed_reviews]) if completed_reviews<3 else None


class WrongQuestionReview:
    def __init__(self,repository,clock=None):
        self.repository=repository
        self.clock=clock or (lambda:datetime.now(timezone.utc))

    def view(self,user_id):
        day=study_date(self.clock())
        with self.repository.read() as db:
            row=db.execute('SELECT * FROM wrong_question_daily_reviews WHERE user_id=? AND study_date=?',(user_id,day)).fetchone()
            return {'date':day,'started':bool(row),'groups':json.loads(row['plan_json']) if row else []}

    def start(self,user_id):
        day=study_date(self.clock())
        with self.repository.transaction() as db:
            existing=db.execute('SELECT 1 FROM wrong_question_daily_reviews WHERE user_id=? AND study_date=?',(user_id,day)).fetchone()
            if not existing:
                minutes=None
                if db.execute("SELECT 1 FROM sqlite_master WHERE name='diagnosis_profiles'").fetchone():
                    profile=db.execute('SELECT fields_json FROM diagnosis_profiles WHERE user_id=?',(user_id,)).fetchone()
                    if profile:
                        value=json.loads(profile[0]).get('daily_minutes')
                        try:
                            minutes=int(value)
                        except (ValueError,TypeError):
                            pass
                rows=db.execute("""SELECT l.*,w.question_text FROM wrong_question_learning l JOIN wrong_questions w ON w.id=l.wrong_question_id
                    WHERE l.user_id=? AND l.suppressed=0 AND l.stage!='mastered'
                    AND (l.stage!='review' OR l.due_date IS NULL OR l.due_date<=?)
                    ORDER BY CASE WHEN l.due_date<=? THEN 0 WHEN l.wrong_count>1 THEN 1 ELSE 2 END,
                    COALESCE(l.due_date,'9999'),l.id LIMIT ?""",(user_id,day,day,daily_limit(minutes))).fetchall()
                groups=[{'learning_id':r['id'],'question_id':r['wrong_question_id'],'title':r['question_text'],
                         'stage':r['stage'],'outcome':None} for r in rows]
                db.execute('INSERT INTO wrong_question_daily_reviews VALUES(?,?,0,?,?)',(user_id,day,encode(groups),utc_now()))
        return self.view(user_id)

    def outcome(self,db,user_id,learning_id,outcome,evidence_id):
        day=study_date(self.clock())
        row=db.execute('SELECT plan_json FROM wrong_question_daily_reviews WHERE user_id=? AND study_date=?',(user_id,day)).fetchone()
        if row:
            groups=json.loads(row[0])
            for group in groups:
                if group['learning_id']==learning_id and not group.get('outcome'):
                    group.update(outcome=outcome,evidence_id=evidence_id)
            db.execute('UPDATE wrong_question_daily_reviews SET plan_json=?,revision=revision+1 WHERE user_id=? AND study_date=?',(encode(groups),user_id,day))
