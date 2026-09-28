"""账号管理：鉴权、变更、会话撤销与审计同事务提交。"""
import json
import sqlite3
from pydantic import ValidationError
from app.schemas.admin_workspace import CreateAccount, UpdateAccount, StateChange, PasswordReset
from app.services.student_workspace_service import StudentWorkspaceService as Workspace
from .repository import require_actor, public_account
from .schema import stamp, initialize_account_state
from .errors import AdminError
from app.education.grants import revoke_account_grants
from app.education.errors import EducationError


def record_event(db, actor_id, target_id, kind, request_id, summary=None):
    db.execute('''INSERT INTO admin_action_events(actor_id,target_id,kind,request_id,summary,occurred_at)
        VALUES(?,?,?,?,?,?)''', (actor_id,target_id,kind,str(request_id),json.dumps(summary or {},ensure_ascii=False),stamp()))


def validate_page(offset, limit):
    if offset < 0 or not 1 <= limit <= 100:
        raise AdminError('分页参数无效')


class AdminAccounts:
    def __init__(self, repo, *, session_token_hash=None):
        self.repo = repo
        self.session_token_hash = session_token_hash

    def get_account(self, actor_id, target_id):
        with self.repo.read() as db:
            require_actor(db, actor_id)
            return public_account(db, target_id)

    def list_accounts(self, actor_id, *, search='', role=None, state='active', offset=0, limit=20):
        validate_page(offset,limit)
        if state not in ('active','disabled','deleted','all') or role not in (None,'','student','teacher','admin','parent','coach'):
            raise AdminError('筛选条件无效')
        clauses, args = ['1=1'], []
        if state != 'all': clauses.append('s.state=?'); args.append(state)
        if role: clauses.append('u.role=?'); args.append(role)
        if search:
            clauses.append('(instr(lower(u.username),lower(?))>0 OR instr(u.display_name,?)>0)')
            args.extend([search[:100],search[:100]])
        with self.repo.read() as db:
            require_actor(db,actor_id)
            query = ' FROM users u JOIN admin_account_states s ON s.user_id=u.id WHERE '+' AND '.join(clauses)
            count = db.execute('SELECT count(*)'+query,args).fetchone()[0]
            ids = db.execute('SELECT u.id'+query+' ORDER BY u.id DESC LIMIT ? OFFSET ?',args+[limit,offset]).fetchall()
            return {'items':[public_account(db,r[0]) for r in ids],'total':count,'offset':offset,'limit':limit}

    def list_events(self,actor_id,*,target_id=None,offset=0,limit=20):
        validate_page(offset,limit)
        with self.repo.read() as db:
            require_actor(db,actor_id)
            where,args = (' WHERE target_id=?',[target_id]) if target_id is not None else ('',[])
            count = db.execute('SELECT count(*) FROM admin_action_events'+where,args).fetchone()[0]
            rows = db.execute('SELECT id,actor_id,target_id,kind,summary,occurred_at FROM admin_action_events'+where+' ORDER BY id DESC LIMIT ? OFFSET ?',args+[limit,offset]).fetchall()
            return {'items':[dict(r)|{'summary':json.loads(r['summary'])} for r in rows],'total':count,'offset':offset,'limit':limit}

    def _write(self,actor_id,target_id,payload,model,kind):
        try:
            data = model.model_validate(payload).model_dump()
        except ValidationError:
            raise AdminError('账号资料格式不正确') from None
        request_id = str(data['request_id'])
        # 复核密码使用与登录独立的计数键，避免管理操作耗尽普通登录额度。
        attempt_key = f'admin-action:{actor_id}'
        Workspace._require_login_attempt_allowed(attempt_key)
        with self.repo.transaction() as db:
            actor = require_actor(db,actor_id)
            # HTTP 请求需在获得写锁后复核实际会话，拒绝排队期间已退出或被撤销的请求。
            if self.session_token_hash is not None:
                session = db.execute('''SELECT 1 FROM sessions WHERE token_hash=? AND user_id=?
                    AND auth_version=? AND expires_at>?''',
                    (self.session_token_hash,actor_id,actor['auth_version'],Workspace._now())).fetchone()
                if session is None:
                    raise AdminError('登录已失效，请重新登录',401)
            if not Workspace._verify_password(data['admin_password'],actor['password_hash']):
                Workspace._record_failed_login(attempt_key)
                raise AdminError('管理员密码不正确',403)
            Workspace._clear_failed_logins(attempt_key)
            previous = db.execute('SELECT target_id,kind FROM admin_action_events WHERE actor_id=? AND request_id=?',(actor_id,request_id)).fetchone()
            if previous:
                if previous['kind'] != kind or (target_id is not None and previous['target_id'] != target_id):
                    raise AdminError('请求编号已用于其他操作',409)
                return public_account(db,previous['target_id'])
            old = public_account(db,target_id) if target_id is not None else None
            if old and old['revision'] != data['expected_revision']:
                raise AdminError('账号已被修改，请刷新后重试',409)
            if old and old['state'] == 'deleted' and kind != 'restore':
                raise AdminError('请先恢复此账号',409)
            summary = {}
            try:
                if kind == 'create':
                    username = Workspace._validate_username(data['username'])
                    name = Workspace._validate_display_name(data['display_name'])
                    hashed = Workspace._hash_password(Workspace._validate_password(data['password']))
                    cursor = db.execute('''INSERT INTO users(username,password_hash,display_name,role,grade,created_by,created_at)
                        VALUES(?,?,?,?,?,?,?)''',(username,hashed,name,data['role'],data.get('grade'),actor_id,stamp()))
                    target_id = cursor.lastrowid
                    initialize_account_state(db,target_id)
                    summary = {'role':data['role']}
                elif kind == 'update':
                    if data['role'] in ('parent','coach') and data['role'] != old['role']:
                        raise AdminError('暂不支持创建该角色')
                    self._protect(db,actor_id,old,data['role'],old['state'])
                    db.execute('UPDATE users SET username=?,display_name=?,role=?,grade=? WHERE id=?',(
                        Workspace._validate_username(data['username']),Workspace._validate_display_name(data['display_name']),data['role'],data.get('grade'),target_id))
                    summary = {'role_before':old['role'],'role_after':data['role']}
                elif kind == 'reset-password':
                    hashed = Workspace._hash_password(Workspace._validate_password(data['password']))
                    db.execute('UPDATE users SET password_hash=? WHERE id=?',(hashed,target_id))
                else:
                    states = {'disable':('active','disabled'),'enable':('disabled','active'),'restore':('deleted','disabled')}
                    if kind == 'delete':
                        new_state = 'deleted'
                    else:
                        before,new_state = states[kind]
                        if old['state'] != before: raise AdminError('账号状态已变化，请刷新',409)
                    self._protect(db,actor_id,old,old['role'],new_state)
                    db.execute('UPDATE admin_account_states SET state=?,deleted_at=? WHERE user_id=?',(new_state,stamp() if new_state=='deleted' else None,target_id))
                    summary = {'state_before':old['state'],'state_after':new_state}
                if old:
                    # 停用或改变身份时永久撤销学校授权，恢复账号不自动恢复旧同意。
                    if kind in ('disable', 'delete') or (kind == 'update' and data['role'] != old['role']):
                        try:
                            revoke_account_grants(db, target_id)
                        except EducationError as error:
                            raise AdminError(str(error), error.status_code) from None
                    db.execute('UPDATE admin_account_states SET revision=revision+1,actor_id=?,updated_at=? WHERE user_id=?',(actor_id,stamp(),target_id))
                    # 所有账号编辑都撤销会话，避免重命名或角色修改后留下旧页状态。
                    db.execute('UPDATE users SET auth_version=auth_version+1 WHERE id=?',(target_id,))
                    db.execute('DELETE FROM sessions WHERE user_id=?',(target_id,))
                record_event(db,actor_id,target_id,kind,request_id,summary)
            except sqlite3.IntegrityError as error:
                if 'users.username' in str(error): raise AdminError('该账号已被使用，包括已删除账号',409) from None
                raise AdminError('账号操作未保存，请重试',503) from None
            return public_account(db,target_id)

    @staticmethod
    def _protect(db,actor_id,old,new_role,new_state):
        losing = new_role != 'admin' or new_state != 'active'
        if old['id']==actor_id and losing:
            raise AdminError('不能降低、停用或删除当前管理员',409)
        if old['role']=='admin' and old['state']=='active' and losing:
            count=db.execute("SELECT count(*) FROM users u JOIN admin_account_states s ON s.user_id=u.id WHERE u.role='admin' AND s.state='active'").fetchone()[0]
            if count<=1: raise AdminError('必须保留至少一名正常管理员',409)

    def create_account(self,actor_id,payload): return self._write(actor_id,None,payload,CreateAccount,'create')
    def update_account(self,actor_id,target_id,payload): return self._write(actor_id,target_id,payload,UpdateAccount,'update')
    def change_state(self,actor_id,target_id,payload):
        if payload.get('action') not in ('disable','enable','delete','restore'): raise AdminError('状态操作无效')
        return self._write(actor_id,target_id,payload,StateChange,payload['action'])
    def reset_password(self,actor_id,target_id,payload): return self._write(actor_id,target_id,payload,PasswordReset,'reset-password')
