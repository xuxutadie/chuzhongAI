"""学生逐人授权：邀请码只标识邀请，不能替代学生本人明确同意。"""
from uuid import uuid4
from app.admin_workspace.schema import account_is_active, stamp
from .schema import education_schema_ready
from .policy import require_session, require_context
from .models import validated, HistoryInvite, ConfirmHistory, RevokeGrant
from .errors import EducationError
from .service import (token_digest, new_invitation_token, invitation_expiry, check_request,
                      record_event, revoke_membership_grants, require_target_role)

HISTORY_SCOPE = 'all_learning_history_read'
HISTORY_NOTICE = ('允许此教师只读查看你的全部历史和授权有效期间新增的学习记录，包括其他学校期间的'
                  '已提交测评、错题和报告；不允许修改。你可随时撤销在线访问，已下载文件无法收回。')


def revoke_account_grants(db, user_id):
    """在账号变更的原事务执行；未迁移库不访问新表。"""
    if not education_schema_ready(db):
        # 若已经部分迁移却缺表，不能忽略撤销失败后继续停用／恢复账号。
        if db.execute("SELECT 1 FROM sqlite_master WHERE name LIKE 'education_%'").fetchone():
            raise EducationError('学校权限结构不完整，请先修复升级', 503)
        return
    for member in db.execute('SELECT id FROM education_memberships WHERE user_id=?', (user_id,)).fetchall():
        revoke_membership_grants(db, member['id'])
    db.execute('UPDATE education_memberships SET revision=revision+1,updated_at=? WHERE user_id=?', (stamp(), user_id))
    db.execute("""UPDATE education_student_grants SET state='revoked',revision=revision+1,updated_at=?
        WHERE student_id=? AND state='active'""", (stamp(), user_id))
    db.execute("UPDATE education_history_invitations SET state='revoked' WHERE student_id=? AND state='pending'", (user_id,))
    db.execute("UPDATE education_member_invitations SET state='revoked' WHERE (target_id=? OR issuer_id=?) AND state='pending'", (user_id, user_id))


class StudentGrants:
    def __init__(self, repo, identity):
        self.repo = repo
        self.identity = identity

    def _student(self, db):
        user = require_session(db, self.identity)
        if user['role'] != 'student':
            raise EducationError('请由学生本人操作授权', 403)
        return user

    def invite(self, context, payload):
        data = validated(HistoryInvite, payload)
        with self.repo.transaction() as db:
            require_context(db, self.identity, context)
            check_request(db, self.identity.user_id, data['request_id'])
            require_target_role(db, data['student_id'], 'student')
            previous = db.execute('SELECT revision FROM education_student_grants WHERE teacher_membership_id=? AND student_id=?',
                (context.membership_id, data['student_id'])).fetchone()
            token, identifier, expires = new_invitation_token(), str(uuid4()), invitation_expiry()
            db.execute('''INSERT INTO education_history_invitations(id,token_hash,teacher_membership_id,
                membership_revision,space_revision,student_id,expected_grant_revision,state,expires_at,created_at)
                VALUES(?,?,?,?,?,?,?,'pending',?,?)''', (identifier, token_digest(token), context.membership_id,
                context.membership_revision, context.space_revision, data['student_id'], previous['revision'] if previous else 0,
                expires, stamp()))
            record_event(db, self.identity.user_id, data['request_id'], 'history_invited', identifier)
            return {'id': identifier, 'token': token, 'expires_at': expires, 'scope': HISTORY_SCOPE, 'notice': HISTORY_NOTICE}

    def _invitation(self, db, token, *, allow_consumed=False):
        row = db.execute('''SELECT i.*,m.user_id AS teacher_id,m.space_id,s.name AS space_name,
            u.display_name AS teacher_name FROM education_history_invitations i
            JOIN education_memberships m ON m.id=i.teacher_membership_id
            JOIN education_spaces s ON s.id=m.space_id JOIN users u ON u.id=m.user_id
            WHERE i.token_hash=? AND i.student_id=? AND m.state='active' AND s.state='active'
            AND m.role IN ('school_admin','teacher') AND u.role IN ('admin','teacher')
            AND m.revision=i.membership_revision AND s.revision=i.space_revision''',
            (token_digest(token), self.identity.user_id)).fetchone()
        if (row is None or row['state'] == 'revoked' or not account_is_active(db, row['teacher_id'])
                or (row['expires_at'] <= stamp() and row['state'] != 'consumed')):
            raise EducationError('邀请不存在或已失效', 404)
        if row['state'] == 'consumed' and not allow_consumed:
            raise EducationError('邀请已经处理', 409)
        return row

    def preview(self, token):
        if not isinstance(token, str) or not 20 <= len(token) <= 128:
            raise EducationError('邀请不存在或已失效', 404)
        with self.repo.read() as db:
            self._student(db)
            invite = self._invitation(db, token)
            return {key: invite[key] for key in ('id', 'teacher_name', 'space_name', 'expires_at')} | {
                'scope': HISTORY_SCOPE, 'notice': HISTORY_NOTICE}

    def confirm(self, payload):
        data = validated(ConfirmHistory, payload)
        if not data['consent']:
            raise EducationError('需要本人明确同意后才能授权', 422)
        with self.repo.transaction() as db:
            self._student(db)
            invite = self._invitation(db, data['token'], allow_consumed=True)
            old = db.execute('SELECT * FROM education_student_grants WHERE teacher_membership_id=? AND student_id=?',
                (invite['teacher_membership_id'], self.identity.user_id)).fetchone()
            if invite['state'] == 'consumed':
                # 重试只能读取同一次仍有效的授权，绝不以重试为由恢复已撤销记录。
                if (invite['consumed_request_id'] == data['request_id'] and old and old['state'] == 'active'
                        and old['id'] == invite['result_id'] and old['revision'] == invite['result_revision']):
                    return dict(old)
                raise EducationError('邀请已处理或授权已变化，请使用新的邀请', 409)
            check_request(db, self.identity.user_id, data['request_id'])
            if (old['revision'] if old else 0) != invite['expected_grant_revision']:
                raise EducationError('授权已变化，请使用新的邀请', 409)
            identifier, now = old['id'] if old else str(uuid4()), stamp()
            if old:
                db.execute("UPDATE education_student_grants SET state='active',revision=revision+1,updated_at=? WHERE id=?", (now, identifier))
            else:
                db.execute('''INSERT INTO education_student_grants(id,student_id,teacher_membership_id,scope,state,revision,created_at,updated_at)
                    VALUES(?,?,?,?,'active',1,?,?)''', (identifier, self.identity.user_id, invite['teacher_membership_id'], HISTORY_SCOPE, now, now))
            result = db.execute('SELECT * FROM education_student_grants WHERE id=?', (identifier,)).fetchone()
            # 同一学生与教师的旧邀请一并作废，避免先前发出的码在撤权后再次生效。
            db.execute("""UPDATE education_history_invitations SET state='revoked' WHERE student_id=?
                AND teacher_membership_id=? AND state='pending' AND id<>?""", (self.identity.user_id, invite['teacher_membership_id'], invite['id']))
            db.execute("""UPDATE education_history_invitations SET state='consumed',consumed_request_id=?,
                result_id=?,result_revision=? WHERE id=?""", (data['request_id'], identifier, result['revision'], invite['id']))
            record_event(db, self.identity.user_id, data['request_id'], 'history_confirmed', identifier)
            return dict(result)

    def list_mine(self):
        with self.repo.read() as db:
            self._student(db)
            rows = db.execute('''SELECT g.*,u.display_name AS teacher_name,s.name AS space_name,
                m.state AS membership_state,s.state AS space_state FROM education_student_grants g
                JOIN education_memberships m ON m.id=g.teacher_membership_id JOIN education_spaces s ON s.id=m.space_id
                JOIN users u ON u.id=m.user_id WHERE g.student_id=? ORDER BY g.created_at,g.id''', (self.identity.user_id,)).fetchall()
            return [dict(row) | {'notice': HISTORY_NOTICE} for row in rows]

    def revoke(self, grant_id, payload):
        data = validated(RevokeGrant, payload)
        with self.repo.transaction() as db:
            self._student(db)
            check_request(db, self.identity.user_id, data['request_id'])
            old = db.execute('SELECT * FROM education_student_grants WHERE id=? AND student_id=?',
                (grant_id, self.identity.user_id)).fetchone()
            if old is None: raise EducationError('未找到授权记录', 404)
            if old['revision'] != data['expected_revision'] or old['state'] != 'active':
                raise EducationError('授权已变化，请刷新后重试', 409)
            db.execute("UPDATE education_student_grants SET state='revoked',revision=revision+1,updated_at=? WHERE id=?", (stamp(), grant_id))
            db.execute("""UPDATE education_history_invitations SET state='revoked' WHERE student_id=?
                AND teacher_membership_id=? AND state='pending'""", (self.identity.user_id, old['teacher_membership_id']))
            record_event(db, self.identity.user_id, data['request_id'], 'history_revoked', grant_id)
            return dict(db.execute('SELECT * FROM education_student_grants WHERE id=?', (grant_id,)).fetchone())
