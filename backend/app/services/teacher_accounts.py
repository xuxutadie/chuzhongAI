"""教师账号与任教资料；认领权限与管理员权限明确分离。"""
import json
import sqlite3
from datetime import datetime, timezone
from app.services.student_workspace_service import ResourceConflictError, ResourceNotFoundError
from app.admin_workspace.schema import initialize_account_state


class TeacherAccounts:
    def __init__(self, repository, workspace):
        self.repository = repository
        self.workspace = workspace

    def register(self, *, username, password, display_name, school_name, teaching_classes):
        service = self.workspace
        username = service._validate_username(username)
        name = service._validate_display_name(display_name)
        hashed = service._hash_password(service._validate_password(password))
        now = datetime.now(timezone.utc).isoformat()
        with self.repository.transaction() as db:
            if db.execute('SELECT 1 FROM users WHERE username=?', (username,)).fetchone():
                raise ResourceConflictError('该用户名已被使用')
            try:
                cursor = db.execute('''INSERT INTO users(username,password_hash,display_name,role,created_at)
                    VALUES(?,?,?,'teacher',?)''', (username, hashed, name, now))
                user_id = cursor.lastrowid
                initialize_account_state(db, user_id)
                db.execute('INSERT INTO teacher_profiles VALUES(?,?,?,?)',
                           (user_id, school_name, json.dumps(list(dict.fromkeys(teaching_classes)), ensure_ascii=False), now))
            except sqlite3.IntegrityError as error:
                # 只转换真正的重复账号；其他写入异常由事务整体回滚。
                if 'users.username' in str(error):
                    raise ResourceConflictError('该用户名已被使用') from None
                raise
            user = dict(db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone())
        return service._create_authenticated_response(user)

    def profile(self, user_id):
        with self.repository.read() as db:
            user = db.execute("SELECT display_name FROM users WHERE id=? AND role IN ('teacher','admin')", (user_id,)).fetchone()
            if not user:
                raise ResourceNotFoundError('未找到教师资料')
            row = db.execute('SELECT * FROM teacher_profiles WHERE user_id=?', (user_id,)).fetchone()
            return {'user_id': user_id, 'display_name': user['display_name'],
                    'school_name': row['school_name'] if row else '',
                    'teaching_classes': json.loads(row['teaching_classes_json']) if row else []}

    def save_profile(self, user_id, school_name, teaching_classes):
        with self.repository.transaction() as db:
            db.execute('''INSERT INTO teacher_profiles VALUES(?,?,?,?) ON CONFLICT(user_id)
                DO UPDATE SET school_name=excluded.school_name,
                teaching_classes_json=excluded.teaching_classes_json,updated_at=excluded.updated_at''',
                (user_id, school_name, json.dumps(list(dict.fromkeys(teaching_classes)), ensure_ascii=False),
                 datetime.now(timezone.utc).isoformat()))
        return self.profile(user_id)
