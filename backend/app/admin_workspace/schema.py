"""管理状态显式迁移；旧业务表不重建、不删除。"""
from datetime import datetime, timezone


def stamp():
    return datetime.now(timezone.utc).isoformat()


def admin_schema_ready(db):
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='admin_schema_versions'").fetchone()
    return bool(exists and db.execute('SELECT 1 FROM admin_schema_versions WHERE version=1').fetchone())


def migrate_admin_schema(db):
    if not db.in_transaction:
        raise ValueError('迁移必须在独立事务中执行')
    if admin_schema_ready(db):
        return
    statements = [
        '''CREATE TABLE admin_account_states(
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','disabled','deleted')),
            revision INTEGER NOT NULL DEFAULT 1, actor_id INTEGER REFERENCES users(id),
            updated_at TEXT NOT NULL, deleted_at TEXT)''',
        '''CREATE TABLE admin_action_events(
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER REFERENCES users(id),
            target_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
            request_id TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '{}',
            occurred_at TEXT NOT NULL, UNIQUE(actor_id,request_id))''',
        'CREATE INDEX admin_events_time ON admin_action_events(occurred_at,id)',
        'CREATE TABLE admin_schema_versions(version INTEGER PRIMARY KEY)',
    ]
    for statement in statements:
        db.execute(statement)
    db.execute("INSERT INTO admin_account_states(user_id,updated_at) SELECT id,? FROM users", (stamp(),))
    db.execute('INSERT INTO admin_schema_versions VALUES(1)')


def initialize_account_state(db, user_id):
    if admin_schema_ready(db):
        db.execute('INSERT INTO admin_account_states(user_id,updated_at) VALUES(?,?)', (user_id, stamp()))


def account_is_active(db, user_id):
    if not admin_schema_ready(db):
        # 完全未迁移的旧库保持原行为；部分迁移或版本损坏时禁止放行。
        return not db.execute("SELECT 1 FROM sqlite_master WHERE name IN ('admin_schema_versions','admin_account_states')").fetchone()
    row = db.execute('SELECT state FROM admin_account_states WHERE user_id=?', (user_id,)).fetchone()
    return row is not None and row[0] == 'active'
