"""带租约令牌的持久化工作队列；取消与结果提交在同一事务边界判断。"""
import json
import time
from uuid import uuid4
from datetime import datetime,timezone
from .repository import KnowledgeError,pack,stamp
from .access import scoped_database, require_job_context
from app.education.errors import EducationError


class KnowledgeJobs:
    def __init__(self,repo):
        self.repo=repo

    def enqueue(self,owner_id,kind,payload,request_id):
        if kind not in ('import','generate') or not request_id or len(request_id)>100:
            raise KnowledgeError('任务类型或请求标识无效')
        units=payload.get('units',[payload])
        if not units or len(units)>(10 if kind=='import' else 50):
            raise KnowledgeError('单次上传最多 10 个文件，生成最多 50 道题')
        with self.repo.transaction() as db:
            clause,args=self.repo.scope_clause(db,owner_id)
            old=db.execute('SELECT id,payload FROM tk_jobs WHERE owner_id=? AND request_id=?'+clause,[owner_id,request_id,*args]).fetchone()
            if old:
                if json.loads(old['payload'])!=payload:
                    raise KnowledgeError('相同请求标识的内容不能改变',409)
                identifier=old['id']
            else:
                identifier=str(uuid4()); now=stamp()
                columns=''; values=[]
                if args:
                    context=self.repo.context
                    if context is None: raise KnowledgeError('后台任务不能创建新的任务',403)
                    auth_version=db.execute('SELECT auth_version FROM users WHERE id=?',(owner_id,)).fetchone()[0]
                    columns=',space_id,membership_id,space_revision,membership_revision,auth_version'
                    values=[context.space_id,context.membership_id,context.space_revision,context.membership_revision,auth_version]
                db.execute(f'INSERT INTO tk_jobs(id,owner_id,kind,payload,request_id,created_at,updated_at{columns}) VALUES(?,?,?,?,?,?,?{",?"*len(values)})',
                           [identifier,owner_id,kind,pack(payload),request_id,now,now,*values])
                for index,unit in enumerate(units):
                    db.execute('INSERT INTO tk_job_units(id,job_id,position,payload) VALUES(?,?,?,?)',
                               (str(uuid4()),identifier,index,pack(unit)))
        return self.status(owner_id,identifier)

    def _owned(self,db,owner_id,job_id):
        clause,args=self.repo.scope_clause(db,owner_id)
        row=db.execute('SELECT * FROM tk_jobs WHERE id=? AND owner_id=?'+clause,[job_id,owner_id,*args]).fetchone()
        if row is None: raise KnowledgeError('任务不存在或无权访问',404)
        return dict(row)

    def status(self,owner_id,job_id):
        with self.repo.read() as db:
            row=self._owned(db,owner_id,job_id)
            units=db.execute('SELECT position,state,result,error FROM tk_job_units WHERE job_id=? ORDER BY position',(job_id,)).fetchall()
        self.repo.fresh_access(owner_id)
        return {'id':job_id,'kind':row['kind'],'state':row['state'],'revision':row['revision'],
                'generation':json.loads(row['payload']).get('request') if row['kind']=='generate' else None,
                'completed_units':sum(u['state']=='completed' for u in units),'total_units':len(units),
                'errors':[{'position':u['position'],'message':u['error']} for u in units if u['error']],
                'result_ids':[i for u in units if u['result'] for i in json.loads(u['result']).get('ids',[])]}

    def claim(self,worker_id,now=None):
        current=(now or datetime.now(timezone.utc)).timestamp()
        with self.repo.transaction() as db:
            if scoped_database(db):
                # 先终止失去权限的待执行和执行中任务，不让恢复后的身份接手旧任务。
                for candidate in db.execute("SELECT * FROM tk_jobs WHERE state IN ('queued','running')").fetchall():
                    try:
                        require_job_context(db,candidate)
                    except EducationError:
                        db.execute("UPDATE tk_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=?",(stamp(),candidate['id']))
                        db.execute("UPDATE tk_job_units SET state='cancelled',error='学校权限已失效' WHERE job_id=? AND state IN ('queued','running')",(candidate['id'],))
            expired=db.execute("SELECT id FROM tk_jobs WHERE state='running' AND lease_until<?",(current,)).fetchall()
            for row in expired:
                db.execute("UPDATE tk_job_units SET state='queued' WHERE job_id=? AND state='running'",(row['id'],))
                db.execute("UPDATE tk_jobs SET state='queued',lease_token=NULL,lease_until=NULL WHERE id=?",(row['id'],))
            row=db.execute("""SELECT j.* FROM tk_jobs j WHERE j.state='queued'
                AND (SELECT count(*) FROM tk_jobs r WHERE r.owner_id=j.owner_id AND r.state='running')<2
                ORDER BY j.created_at,j.id LIMIT 1""").fetchone()
            if row is None: return None
            unit=db.execute("SELECT * FROM tk_job_units WHERE job_id=? AND state='queued' ORDER BY position LIMIT 1",(row['id'],)).fetchone()
            if unit is None: return None
            token=str(uuid4())
            db.execute("UPDATE tk_jobs SET state='running',lease_token=?,lease_until=?,revision=revision+1,updated_at=? WHERE id=?",
                       (token,current+180,stamp(),row['id']))
            db.execute("UPDATE tk_job_units SET state='running' WHERE id=?",(unit['id'],))
            return {**dict(row),'payload':json.loads(row['payload']),'unit':json.loads(unit['payload']),
                    'unit_id':unit['id'],'lease_token':token}

    def assert_lease(self,db,job_id,token):
        row=db.execute("SELECT * FROM tk_jobs WHERE id=? AND lease_token=? AND state='running' AND lease_until>=?",
                       (job_id,token,time.time())).fetchone()
        if row is None: raise KnowledgeError('任务已取消、租约失效或结果已提交',409)
        try:
            require_job_context(db,row)
        except EducationError as error:
            raise KnowledgeError(str(error),error.status_code) from None
        return dict(row)

    def renew(self,job_id,token):
        with self.repo.transaction() as db:
            self.assert_lease(db,job_id,token)
            db.execute('UPDATE tk_jobs SET lease_until=? WHERE id=?',(time.time()+180,job_id))

    def complete_unit(self,job_id,lease_token,result,*,db=None):
        if db is None:
            with self.repo.transaction() as connection:
                return self.complete_unit(job_id,lease_token,result,db=connection)
        self.assert_lease(db,job_id,lease_token)
        db.execute("UPDATE tk_job_units SET state='completed',result=?,error=NULL WHERE job_id=? AND state='running'",(pack(result),job_id))
        self._advance(db,job_id)

    def fail_unit(self,job_id,token,error):
        with self.repo.transaction() as db:
            self.assert_lease(db,job_id,token)
            db.execute("UPDATE tk_job_units SET state='failed',error=? WHERE job_id=? AND state='running'",(error[:500],job_id))
            self._advance(db,job_id)

    def _advance(self,db,job_id):
        states=[r[0] for r in db.execute('SELECT state FROM tk_job_units WHERE job_id=?',(job_id,))]
        state='queued' if 'queued' in states else ('partial_failed' if 'completed' in states else 'failed') if 'failed' in states else 'needs_review'
        db.execute('UPDATE tk_jobs SET state=?,lease_token=NULL,lease_until=NULL,revision=revision+1,updated_at=? WHERE id=?',(state,stamp(),job_id))

    def cancel(self,owner_id,job_id,expected_revision):
        with self.repo.transaction() as db:
            row=self._owned(db,owner_id,job_id)
            if row['revision']!=expected_revision: raise KnowledgeError('任务已更新，请重新读取',409)
            if row['state'] not in ('queued','running'): raise KnowledgeError('当前任务不能取消',409)
            db.execute("UPDATE tk_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,revision=revision+1 WHERE id=?",(job_id,))
        return self.status(owner_id,job_id)

    def retry_failed(self,owner_id,job_id,expected_revision):
        with self.repo.transaction() as db:
            row=self._owned(db,owner_id,job_id)
            try:
                require_job_context(db,row)
            except EducationError as error:
                raise KnowledgeError(str(error),error.status_code) from None
            if row['revision']!=expected_revision or row['state'] not in ('failed','partial_failed'):
                raise KnowledgeError('任务状态已变化，不能重试',409)
            db.execute("UPDATE tk_job_units SET state='queued',error=NULL WHERE job_id=? AND state='failed'",(job_id,))
            db.execute("UPDATE tk_jobs SET state='queued',revision=revision+1 WHERE id=?",(job_id,))
        return self.status(owner_id,job_id)
