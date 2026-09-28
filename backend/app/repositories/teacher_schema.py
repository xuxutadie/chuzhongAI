"""显式迁移教师权限结构；调用方负责备份及事务，页面读取不执行迁移。"""
import sqlite3

USER_COLUMNS = ('id', 'username', 'password_hash', 'display_name', 'role', 'grade',
                'auth_version', 'created_by', 'created_at')

TABLES = [
    '''CREATE TABLE IF NOT EXISTS teacher_profiles(
        user_id INTEGER PRIMARY KEY REFERENCES users(id), school_name TEXT NOT NULL,
        teaching_classes_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS teacher_student_links(
        id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL REFERENCES users(id),
        student_id INTEGER NOT NULL REFERENCES users(id), source TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','revoked')),
        linked_at TEXT NOT NULL, revoked_at TEXT, revision INTEGER NOT NULL DEFAULT 1,
        UNIQUE(teacher_id,student_id))''',
    '''CREATE TABLE IF NOT EXISTS student_claim_codes(
        id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT NOT NULL UNIQUE,
        student_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, revoked_at TEXT, consumed_at TEXT,
        consumed_by INTEGER REFERENCES users(id), request_id TEXT,
        link_id INTEGER REFERENCES teacher_student_links(id), link_revision INTEGER,
        UNIQUE(consumed_by,request_id))''',
    '''CREATE TABLE IF NOT EXISTS teacher_action_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL, occurred_at TEXT NOT NULL, object_id INTEGER)''',
    '''CREATE INDEX IF NOT EXISTS idx_teacher_actions_rate
        ON teacher_action_events(actor_id,kind,occurred_at)''',
    '''CREATE INDEX IF NOT EXISTS idx_teacher_links_student
        ON teacher_student_links(student_id,status)''',
    '''CREATE INDEX IF NOT EXISTS idx_claim_codes_student
        ON student_claim_codes(student_id,expires_at)''',
    'CREATE TABLE IF NOT EXISTS teacher_schema_versions(version INTEGER PRIMARY KEY)',
]


def migrate_teacher_schema(db: sqlite3.Connection) -> None:
    if not db.in_transaction or db.execute('PRAGMA foreign_keys').fetchone()[0]:
        raise ValueError('迁移须先在事务外关闭外键，再开始独立事务')
    exists = db.execute("SELECT name FROM sqlite_master WHERE name='teacher_schema_versions'").fetchone()
    if exists and db.execute('SELECT 1 FROM teacher_schema_versions WHERE version=1').fetchone():
        return
    columns = tuple(row[1] for row in db.execute('PRAGMA table_info(users)'))
    if set(columns) != set(USER_COLUMNS):
        raise ValueError('账号表结构与已支持版本不一致，已停止迁移，请先检查数据库版本')
    # 保留自定义索引、触发器和自增高水位；不使用 ALTER RENAME 改写子表外键。
    objects = [row[0] for row in db.execute(
        "SELECT sql FROM sqlite_master WHERE tbl_name='users' AND type IN ('index','trigger') AND sql IS NOT NULL")]
    sequence = db.execute("SELECT seq FROM sqlite_sequence WHERE name='users'").fetchone()
    db.execute('''CREATE TABLE users_teacher_migration(
        id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL, display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','student','parent','coach','teacher')),
        grade TEXT, auth_version INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL)''')
    names = ','.join(USER_COLUMNS)
    db.execute(f'INSERT INTO users_teacher_migration({names}) SELECT {names} FROM users')
    db.execute('DROP TABLE users')
    db.execute('ALTER TABLE users_teacher_migration RENAME TO users')
    if sequence:
        db.execute("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='users'", (sequence[0],))
    for sql in objects:
        db.execute(sql)
    for sql in TABLES:
        db.execute(sql)
    db.execute('''INSERT INTO teacher_student_links(teacher_id,student_id,source,status,linked_at)
        SELECT t.id,s.id,'legacy_created','active',strftime('%Y-%m-%dT%H:%M:%f+00:00','now')
        FROM users s JOIN users t ON s.created_by=t.id
        WHERE s.role='student' AND t.role='admin' ''')
    if db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('迁移后外键检查未通过，事务必须回滚')
    db.execute('INSERT INTO teacher_schema_versions VALUES(1)')
