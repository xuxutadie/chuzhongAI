"""管理员连接与身份检查，所有目标查询均在实际会话鉴权之后。"""
from app.repositories.teacher_repository import TeacherRepository
from .schema import admin_schema_ready, account_is_active
from .errors import AdminError


class AdminRepository(TeacherRepository):
    def ready(self):
        with self.read() as db:
            return admin_schema_ready(db)


def require_actor(db, actor_id):
    if not admin_schema_ready(db):
        raise AdminError('管理员功能需要完成数据库升级', 503)
    row = db.execute('SELECT * FROM users WHERE id=?', (actor_id,)).fetchone()
    if row is None or row['role'] != 'admin' or not account_is_active(db, actor_id):
        raise AdminError('请使用有效的管理员账号', 403)
    return row


def public_account(db, target_id):
    row = db.execute('''SELECT u.id,u.username,u.display_name,u.role,u.grade,u.created_at,
        s.state,s.revision FROM users u JOIN admin_account_states s ON s.user_id=u.id WHERE u.id=?''', (target_id,)).fetchone()
    if row is None:
        raise AdminError('未找到账号', 404)
    return dict(row)
