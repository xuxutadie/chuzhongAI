"""知识库 HTTP 身份与持久任务身份分开校验，不为后台伪造登录会话。"""
import time
from app.admin_workspace.schema import account_is_active
from app.education.errors import EducationError
from app.education.runtime import cutover_enabled


def scoped_database(db):
    enabled = cutover_enabled(db)
    if enabled:
        exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='tk_schema_versions'").fetchone()
        if not exists or not db.execute('SELECT 1 FROM tk_schema_versions WHERE version=2').fetchone():
            raise EducationError('学校知识库尚未完成升级', 503)
    return enabled


def require_job_context(db, job):
    """任务捕获账号与成员版本；停用后恢复也不能复活旧任务。"""
    if not scoped_database(db):
        return
    user = db.execute('SELECT role,auth_version FROM users WHERE id=?', (job['owner_id'],)).fetchone()
    member = db.execute('''SELECT m.revision,m.role,s.revision AS space_revision
        FROM education_memberships m JOIN education_spaces s ON s.id=m.space_id
        WHERE m.id=? AND m.space_id=? AND m.user_id=? AND m.state='active' AND s.state='active' ''',
        (job['membership_id'], job['space_id'], job['owner_id'])).fetchone()
    if (not user or not account_is_active(db, job['owner_id']) or user['role'] not in ('admin','teacher')
        or not member or member['role'] not in ('school_admin','teacher')
        or user['auth_version'] != job['auth_version'] or member['revision'] != job['membership_revision']
        or member['space_revision'] != job['space_revision']):
        raise EducationError('任务的学校权限已失效，请重新发起', 409)


def require_running_job(db, job_id, token):
    job = db.execute("SELECT * FROM tk_jobs WHERE id=? AND lease_token=? AND state='running' AND lease_until>=?",
                     (job_id, token, time.time())).fetchone()
    if job is None:
        raise EducationError('任务已取消或租约已失效', 409)
    require_job_context(db, job)
    return job
