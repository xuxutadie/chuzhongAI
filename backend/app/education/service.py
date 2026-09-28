"""学校和成员状态变更，与实际会话复核及审计在同一写事务中完成。"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from app.admin_workspace.schema import account_is_active, stamp
from .errors import EducationError
from .policy import require_session, require_platform_admin, require_context
from .models import validated, CreateSpace, MemberInvite, AcceptInvite, StateChange, MemberRoleChange


def token_digest(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def new_invitation_token():
    return secrets.token_urlsafe(32)


def invitation_expiry():
    return (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()


def check_request(db, actor_id, request_id):
    if db.execute('SELECT 1 FROM education_events WHERE actor_id=? AND request_id=?',
                  (actor_id, request_id)).fetchone():
        raise EducationError('此操作已处理，请刷新查看结果', 409)


def record_event(db, actor_id, request_id, kind, target_id):
    # 审计只存事件标识，不记录邀请码、学生学习内容或凭证。
    db.execute('''INSERT INTO education_events(actor_id,request_id,kind,target_id,occurred_at)
        VALUES(?,?,?,?,?)''', (actor_id, request_id, kind, str(target_id), stamp()))


def revoke_membership_grants(db, member_id):
    db.execute("""UPDATE education_student_grants SET state='revoked',revision=revision+1,updated_at=?
        WHERE teacher_membership_id=? AND state='active'""", (stamp(), member_id))
    db.execute("UPDATE education_history_invitations SET state='revoked' WHERE teacher_membership_id=? AND state='pending'", (member_id,))
    db.execute("UPDATE education_member_invitations SET state='revoked' WHERE issuer_membership_id=? AND state='pending'", (member_id,))


def require_target_role(db, target_id, member_role):
    row = db.execute('SELECT role FROM users WHERE id=?', (target_id,)).fetchone()
    expected = ('student',) if member_role == 'student' else ('teacher', 'admin')
    if row is None or row['role'] not in expected or not account_is_active(db, target_id):
        raise EducationError('未找到符合条件的账号', 404)


class EducationSpaces:
    def __init__(self, repo, identity):
        self.repo = repo
        self.identity = identity

    def members(self, context, space_id, offset=0, limit=20):
        if offset < 0 or not 1 <= limit <= 100: raise EducationError('分页无效',422)
        with self.repo.read() as db:
            if context is None: require_platform_admin(db,self.identity)
            else:
                require_context(db,self.identity,context,('school_admin',))
                if context.space_id != space_id: raise EducationError('学校不存在',404)
            if not db.execute('SELECT 1 FROM education_spaces WHERE id=?',(space_id,)).fetchone():
                raise EducationError('学校不存在',404)
            total=db.execute('SELECT count(*) FROM education_memberships WHERE space_id=?',(space_id,)).fetchone()[0]
            rows=db.execute('''SELECT m.id,m.user_id,m.role,m.state,m.revision,u.display_name
                FROM education_memberships m JOIN users u ON u.id=m.user_id
                WHERE m.space_id=? ORDER BY m.created_at,m.id LIMIT ? OFFSET ?''',(space_id,limit,offset)).fetchall()
            return {'items':[dict(row) for row in rows],'total':total}

    def preview_member(self, token):
        with self.repo.read() as db:
            require_session(db,self.identity)
            invite=db.execute('''SELECT i.*,s.name AS school_name,s.state AS space_state,s.revision AS current_revision,
                u.role AS issuer_role,u.display_name AS issuer_name FROM education_member_invitations i
                JOIN education_spaces s ON s.id=i.space_id JOIN users u ON u.id=i.issuer_id
                WHERE i.token_hash=? AND i.target_id=?''',(token_digest(token),self.identity.user_id)).fetchone()
            if (not invite or invite['state']!='pending' or invite['expires_at']<=stamp()
                or invite['space_state']!='active' or invite['current_revision']!=invite['space_revision']
                or not account_is_active(db,invite['issuer_id'])):
                raise EducationError('邀请不存在或已失效',404)
            if invite['issuer_membership_id']:
                valid=invite['issuer_role'] in ('admin','teacher') and db.execute('''SELECT 1 FROM education_memberships
                    WHERE id=? AND user_id=? AND space_id=? AND role='school_admin' AND state='active' AND revision=?''',
                    (invite['issuer_membership_id'],invite['issuer_id'],invite['space_id'],invite['issuer_membership_revision'])).fetchone()
            else: valid=invite['issuer_role']=='admin'
            if not valid: raise EducationError('邀请不存在或已失效',404)
            require_target_role(db,self.identity.user_id,invite['role'])
            return {key:invite[key] for key in ('school_name','issuer_name','role','expires_at')}

    def set_member_role(self, context, membership_id, payload):
        data=validated(MemberRoleChange,payload)
        with self.repo.transaction() as db:
            require_context(db,self.identity,context,('school_admin',))
            check_request(db,self.identity.user_id,data['request_id'])
            old=db.execute('SELECT * FROM education_memberships WHERE id=? AND space_id=?',(membership_id,context.space_id)).fetchone()
            if old is None: raise EducationError('成员不存在',404)
            if old['revision']!=data['expected_revision'] or old['role']==data['role']:
                raise EducationError('成员身份已变化，请刷新',409)
            require_target_role(db,old['user_id'],data['role'])
            if old['role']=='school_admin' and old['state']=='active':
                count=db.execute("SELECT count(*) FROM education_memberships WHERE space_id=? AND role='school_admin' AND state='active'",(context.space_id,)).fetchone()[0]
                if count<=1: raise EducationError('请至少保留一名学校管理员',409)
            db.execute('UPDATE education_memberships SET role=?,revision=revision+1,updated_at=? WHERE id=?',(data['role'],stamp(),membership_id))
            revoke_membership_grants(db,membership_id)
            record_event(db,self.identity.user_id,data['request_id'],'member_role_changed',membership_id)
            return dict(db.execute('SELECT * FROM education_memberships WHERE id=?',(membership_id,)).fetchone())

    def create_space(self, payload):
        data = validated(CreateSpace, payload)
        with self.repo.transaction() as db:
            require_platform_admin(db, self.identity)
            check_request(db, self.identity.user_id, data['request_id'])
            identifier, now = str(uuid4()), stamp()
            db.execute('''INSERT INTO education_spaces(id,name,kind,state,revision,created_at,updated_at)
                VALUES(?,?,?,'active',1,?,?)''', (identifier, data['name'], data['kind'], now, now))
            record_event(db, self.identity.user_id, data['request_id'], 'space_created', identifier)
            return dict(db.execute('SELECT * FROM education_spaces WHERE id=?', (identifier,)).fetchone())

    def list_spaces(self):
        with self.repo.read() as db:
            user = require_session(db, self.identity)
            if user['role'] == 'admin':
                rows = db.execute('SELECT * FROM education_spaces ORDER BY created_at,id').fetchall()
            else:
                rows = db.execute('''SELECT s.*,m.id AS membership_id,m.revision AS membership_revision,m.role
                    FROM education_spaces s JOIN education_memberships m ON m.space_id=s.id
                    WHERE m.user_id=? AND m.state='active' AND s.state='active' ORDER BY s.created_at,s.id''',
                    (self.identity.user_id,)).fetchall()
            return [dict(row) for row in rows]

    def invite_member(self, context, payload):
        data = validated(MemberInvite, payload)
        with self.repo.transaction() as db:
            if context is None:
                require_platform_admin(db, self.identity)
            else:
                require_context(db, self.identity, context, ('school_admin',))
                if context.space_id != data['space_id']:
                    raise EducationError('未找到可管理的学校', 404)
            check_request(db, self.identity.user_id, data['request_id'])
            space = db.execute("SELECT * FROM education_spaces WHERE id=? AND state='active'", (data['space_id'],)).fetchone()
            if space is None: raise EducationError('未找到可管理的学校', 404)
            require_target_role(db, data['target_id'], data['role'])
            if db.execute('SELECT 1 FROM education_memberships WHERE space_id=? AND user_id=?', (space['id'], data['target_id'])).fetchone():
                raise EducationError('账号已存在成员关系，请使用成员管理', 409)
            token, identifier, expires = new_invitation_token(), str(uuid4()), invitation_expiry()
            db.execute('''INSERT INTO education_member_invitations(id,token_hash,space_id,space_revision,
                issuer_id,issuer_membership_id,issuer_membership_revision,target_id,role,state,expires_at,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,'pending',?,?)''', (identifier, token_digest(token), space['id'], space['revision'],
                self.identity.user_id, context.membership_id if context else None,
                context.membership_revision if context else None, data['target_id'], data['role'], expires, stamp()))
            record_event(db, self.identity.user_id, data['request_id'], 'member_invited', identifier)
            return {'id': identifier, 'token': token, 'expires_at': expires}

    def accept_member(self, payload):
        data = validated(AcceptInvite, payload)
        with self.repo.transaction() as db:
            require_session(db, self.identity)
            check_request(db, self.identity.user_id, data['request_id'])
            invite = db.execute('SELECT * FROM education_member_invitations WHERE token_hash=? AND target_id=?',
                (token_digest(data['token']), self.identity.user_id)).fetchone()
            if invite is None or invite['state'] == 'revoked' or invite['expires_at'] <= stamp():
                raise EducationError('邀请不存在或已失效', 404)
            if invite['state'] != 'pending': raise EducationError('邀请已处理', 409)
            space = db.execute("SELECT * FROM education_spaces WHERE id=? AND state='active'", (invite['space_id'],)).fetchone()
            issuer = db.execute('SELECT role FROM users WHERE id=?', (invite['issuer_id'],)).fetchone()
            if (space is None or space['revision'] != invite['space_revision'] or issuer is None
                    or not account_is_active(db, invite['issuer_id'])):
                raise EducationError('邀请不存在或已失效', 404)
            if invite['issuer_membership_id'] is None:
                valid_issuer = issuer['role'] == 'admin'
            else:
                valid_issuer = issuer['role'] in ('admin', 'teacher') and db.execute('''SELECT 1 FROM education_memberships
                    WHERE id=? AND space_id=? AND user_id=? AND role='school_admin' AND state='active' AND revision=?''',
                    (invite['issuer_membership_id'], space['id'], invite['issuer_id'], invite['issuer_membership_revision'])).fetchone()
            if not valid_issuer: raise EducationError('邀请不存在或已失效', 404)
            require_target_role(db, self.identity.user_id, invite['role'])
            if db.execute('SELECT 1 FROM education_memberships WHERE space_id=? AND user_id=?', (space['id'], self.identity.user_id)).fetchone():
                raise EducationError('已存在成员关系，不能用邀请覆盖', 409)
            identifier, now = str(uuid4()), stamp()
            db.execute('''INSERT INTO education_memberships(id,space_id,user_id,role,state,revision,created_at,updated_at)
                VALUES(?,?,?,?,'active',1,?,?)''', (identifier, space['id'], self.identity.user_id, invite['role'], now, now))
            db.execute("UPDATE education_member_invitations SET state='consumed' WHERE id=?", (invite['id'],))
            record_event(db, self.identity.user_id, data['request_id'], 'member_joined', identifier)
            return dict(db.execute('SELECT * FROM education_memberships WHERE id=?', (identifier,)).fetchone())

    def set_space_state(self, space_id, payload):
        data = validated(StateChange, payload)
        with self.repo.transaction() as db:
            require_platform_admin(db, self.identity)
            check_request(db, self.identity.user_id, data['request_id'])
            old = db.execute('SELECT * FROM education_spaces WHERE id=?', (space_id,)).fetchone()
            self._check_change(old, data)
            db.execute('UPDATE education_spaces SET state=?,revision=revision+1,updated_at=? WHERE id=?', (data['state'], stamp(), space_id))
            if data['state'] == 'disabled':
                for member in db.execute('SELECT id FROM education_memberships WHERE space_id=?', (space_id,)).fetchall():
                    revoke_membership_grants(db, member['id'])
                db.execute("UPDATE education_member_invitations SET state='revoked' WHERE space_id=? AND state='pending'", (space_id,))
            record_event(db, self.identity.user_id, data['request_id'], 'space_' + data['state'], space_id)
            return dict(db.execute('SELECT * FROM education_spaces WHERE id=?', (space_id,)).fetchone())

    def set_member_state(self, context, membership_id, payload):
        data = validated(StateChange, payload)
        with self.repo.transaction() as db:
            require_context(db, self.identity, context, ('school_admin',))
            check_request(db, self.identity.user_id, data['request_id'])
            old = db.execute('SELECT * FROM education_memberships WHERE id=? AND space_id=?', (membership_id, context.space_id)).fetchone()
            self._check_change(old, data)
            # 防止误操作让学校无人管理；平台管理员仍可通过专用空间邀请增补管理员。
            if old['role'] == 'school_admin' and data['state'] == 'disabled':
                count = db.execute("SELECT count(*) FROM education_memberships WHERE space_id=? AND role='school_admin' AND state='active'", (context.space_id,)).fetchone()[0]
                if count <= 1: raise EducationError('请至少保留一名学校管理员', 409)
            if data['state'] == 'active': require_target_role(db, old['user_id'], old['role'])
            db.execute('UPDATE education_memberships SET state=?,revision=revision+1,updated_at=? WHERE id=?', (data['state'], stamp(), membership_id))
            if data['state'] == 'disabled': revoke_membership_grants(db, membership_id)
            record_event(db, self.identity.user_id, data['request_id'], 'member_' + data['state'], membership_id)
            return dict(db.execute('SELECT * FROM education_memberships WHERE id=?', (membership_id,)).fetchone())

    @staticmethod
    def _check_change(old, data):
        if old is None: raise EducationError('未找到可管理的对象', 404)
        if old['revision'] != data['expected_revision'] or old['state'] == data['state']:
            raise EducationError('状态已变化，请刷新后重试', 409)
