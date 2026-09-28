"""认领码单次消费、幂等收据及可撤销授权；不改变学生账号管理和 AI 费用归属。"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from app.services.student_workspace_service import (
    AuthenticationRateLimitError, ResourceConflictError, ResourceNotFoundError,
)


def require_legacy_links(db):
    from app.education.runtime import cutover_enabled
    if cutover_enabled(db):
        raise ResourceConflictError('旧认领已停用，请使用学校身份与学生明确授权')


def require_link(db, teacher_id, student_id):
    require_legacy_links(db)
    row = db.execute("SELECT * FROM teacher_student_links WHERE teacher_id=? AND student_id=? AND status='active'",
                     (teacher_id, student_id)).fetchone()
    if row is None:
        raise ResourceNotFoundError("未找到可访问的学生记录")
    return row


def code_hash(code):
    normalized = code.upper().replace("-", "").replace(" ", "")
    return hashlib.sha256(normalized.encode()).hexdigest()


class TeacherLinks:
    def __init__(self, repository, clock=None):
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def charge(db, actor, kind, now, window):
        require_legacy_links(db)
        cutoff = (now - timedelta(seconds=window)).isoformat()
        rows = db.execute("SELECT occurred_at FROM teacher_action_events WHERE actor_id=? AND kind=? AND occurred_at>? ORDER BY occurred_at",
                          (actor, kind, cutoff)).fetchall()
        if len(rows) >= 10:
            retry = max(1, int((datetime.fromisoformat(rows[0][0]) + timedelta(seconds=window) - now).total_seconds()))
            raise AuthenticationRateLimitError(retry, message="操作次数较多，请稍后再试")
        db.execute("INSERT INTO teacher_action_events(actor_id,kind,occurred_at) VALUES(?,?,?)", (actor, kind, now.isoformat()))

    def issue_code(self, student_id):
        now = self.clock()
        code = ''.join(secrets.choice('ABCDEFGHJKLMNPQRSTUVWXYZ23456789') for _ in range(12))
        expires = (now + timedelta(minutes=30)).isoformat()
        with self.repository.transaction() as db:
            self.charge(db, student_id, 'issue', now, 3600)
            db.execute("UPDATE student_claim_codes SET revoked_at=? WHERE student_id=? AND consumed_at IS NULL AND revoked_at IS NULL",
                       (now.isoformat(), student_id))
            db.execute("INSERT INTO student_claim_codes(code_hash,student_id,created_at,expires_at) VALUES(?,?,?,?)",
                       (code_hash(code), student_id, now.isoformat(), expires))
        return {'code': code, 'expires_at': expires}

    @staticmethod
    def receipt(db, row):
        link = require_link(db, row['consumed_by'], row['student_id'])
        if link['revision'] != row['link_revision']:
            raise ResourceNotFoundError('认领码已失效，请学生重新生成')
        return {'link_id': link['id'], 'student_id': link['student_id'], 'linked_at': link['linked_at']}

    def claim(self, teacher_id, code, request_id):
        now, digest = self.clock(), code_hash(code)
        result = None
        with self.repository.transaction() as db:
            require_legacy_links(db)
            previous = db.execute("SELECT * FROM student_claim_codes WHERE consumed_by=? AND request_id=?", (teacher_id, request_id)).fetchone()
            if previous:
                if previous['code_hash'] != digest:
                    raise ResourceConflictError('本次请求编号已用于另一认领码，请重新提交')
                return self.receipt(db, previous)
            self.charge(db, teacher_id, 'claim', now, 600)
            row = db.execute("SELECT * FROM student_claim_codes WHERE code_hash=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?",
                             (digest, now.isoformat())).fetchone()
            if row:
                db.execute("""INSERT INTO teacher_student_links(teacher_id,student_id,source,status,linked_at)
                    VALUES(?,?,'claim_code','active',?) ON CONFLICT(teacher_id,student_id) DO UPDATE SET
                    status='active',source='claim_code',linked_at=excluded.linked_at,revoked_at=NULL,
                    revision=teacher_student_links.revision+1""", (teacher_id, row['student_id'], now.isoformat()))
                link = require_link(db, teacher_id, row['student_id'])
                db.execute("""UPDATE student_claim_codes SET consumed_at=?,consumed_by=?,request_id=?,link_id=?,link_revision=? WHERE id=?""",
                           (now.isoformat(), teacher_id, request_id, link['id'], link['revision'], row['id']))
                result = {'link_id': link['id'], 'student_id': link['student_id'], 'linked_at': link['linked_at']}
        # 失败消费也必须提交限流记录，不能在事务内抛出异常而回滚计数。
        if result is None:
            raise ResourceNotFoundError('认领码无效、过期或已使用，请学生重新生成')
        return result

    def list_for_student(self, student_id):
        with self.repository.read() as db:
            require_legacy_links(db)
            return [dict(row) for row in db.execute("""SELECT l.id AS link_id,l.teacher_id,u.display_name,
                COALESCE(p.school_name,'') AS school_name,l.linked_at,l.source
                FROM teacher_student_links l JOIN users u ON u.id=l.teacher_id
                LEFT JOIN teacher_profiles p ON p.user_id=u.id WHERE l.student_id=? AND l.status='active'
                ORDER BY l.linked_at DESC""", (student_id,))]

    def revoke(self, actor_id, actor_role, link_id):
        with self.repository.transaction() as db:
            require_legacy_links(db)
            field = 'student_id' if actor_role == 'student' else 'teacher_id'
            row = db.execute(f"SELECT * FROM teacher_student_links WHERE id=? AND {field}=?", (link_id, actor_id)).fetchone()
            if not row:
                raise ResourceNotFoundError('未找到可解除的关联')
            if row['status'] == 'active':
                now = self.clock().isoformat()
                db.execute("UPDATE teacher_student_links SET status='revoked',revoked_at=?,revision=revision+1 WHERE id=?", (now, link_id))
                db.execute("INSERT INTO teacher_action_events(actor_id,kind,occurred_at,object_id) VALUES(?,'revoke',?,?)", (actor_id, now, link_id))
