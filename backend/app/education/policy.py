"""集中校验真实会话、学校身份及逐学生授权，不提供管理员隐式绕过。"""
from dataclasses import dataclass
from app.admin_workspace.schema import account_is_active
from app.services.student_workspace_service import StudentWorkspaceService
from .schema import education_schema_ready
from .errors import EducationError


@dataclass(frozen=True)
class SessionIdentity:
    user_id: int
    token_hash: str


@dataclass(frozen=True)
class SpaceContext:
    space_id: str
    membership_id: str
    space_revision: int
    membership_revision: int


def require_session(db, identity):
    if not education_schema_ready(db):
        raise EducationError('学校权限功能尚未完成升级', 503)
    user = db.execute('SELECT * FROM users WHERE id=?', (identity.user_id,)).fetchone()
    if user is None or not account_is_active(db, identity.user_id):
        raise EducationError('登录已失效，请重新登录', 401)
    valid = db.execute('''SELECT 1 FROM sessions WHERE token_hash=? AND user_id=?
        AND auth_version=? AND expires_at>?''', (identity.token_hash, identity.user_id,
        user['auth_version'], StudentWorkspaceService._now())).fetchone()
    if valid is None:
        raise EducationError('登录已失效，请重新登录', 401)
    return user


def require_platform_admin(db, identity):
    user = require_session(db, identity)
    if user['role'] != 'admin':
        raise EducationError('需要平台管理员权限', 403)
    return user


def require_context(db, identity, context, roles=('school_admin', 'teacher')):
    user = require_session(db, identity)
    row = db.execute('''SELECT m.*,s.revision AS space_revision FROM education_memberships m
        JOIN education_spaces s ON s.id=m.space_id WHERE m.id=? AND m.space_id=?
        AND m.user_id=? AND m.state='active' AND s.state='active' ''',
        (context.membership_id, context.space_id, identity.user_id)).fetchone()
    if row is None or row['role'] not in roles:
        raise EducationError('未找到可访问的学校身份', 404)
    if row['role'] in ('teacher', 'school_admin') and user['role'] not in ('teacher', 'admin'):
        raise EducationError('未找到可访问的学校身份', 404)
    if row['role'] == 'student' and user['role'] != 'student':
        raise EducationError('未找到可访问的学校身份', 404)
    if row['revision'] != context.membership_revision or row['space_revision'] != context.space_revision:
        raise EducationError('学校身份已变化，请刷新后重试', 409)
    return row


def require_history(db, identity, context, student_id, expected_revision=None):
    require_context(db, identity, context)
    if not account_is_active(db, student_id):
        raise EducationError('未找到可访问的学生记录', 404)
    row = db.execute('''SELECT * FROM education_student_grants WHERE teacher_membership_id=?
        AND student_id=? AND state='active' AND scope='all_learning_history_read' ''',
        (context.membership_id, student_id)).fetchone()
    if row is None:
        raise EducationError('未找到可访问的学生记录', 404)
    if expected_revision is not None and row['revision'] != expected_revision:
        raise EducationError('学生授权已变化，请刷新后重试', 409)
    return row
