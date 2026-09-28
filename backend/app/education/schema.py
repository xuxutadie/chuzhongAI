"""只在显式迁移事务创建新表，不猜测学校归属或继承旧认领权限。"""
from app.admin_workspace.schema import admin_schema_ready

TABLES = (
    'education_spaces', 'education_memberships', 'education_member_invitations',
    'education_history_invitations', 'education_student_grants', 'education_events',
)


def education_schema_ready(db):
    names = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return (set(TABLES) | {'education_schema_versions'} <= names
            and db.execute('SELECT 1 FROM education_schema_versions WHERE version=1').fetchone() is not None)


def migrate_education_schema(db):
    if not db.in_transaction:
        raise ValueError('教育空间迁移必须在显式事务中执行')
    if education_schema_ready(db):
        return
    if not admin_schema_ready(db):
        raise ValueError('请先完成账号管理迁移')
    statements = [
        '''CREATE TABLE education_spaces(
            id TEXT PRIMARY KEY, name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('school','institution','independent')),
            state TEXT NOT NULL CHECK(state IN ('active','disabled')), revision INTEGER NOT NULL CHECK(revision>0),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL)''',
        '''CREATE TABLE education_memberships(
            id TEXT PRIMARY KEY, space_id TEXT NOT NULL REFERENCES education_spaces(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            role TEXT NOT NULL CHECK(role IN ('school_admin','teacher','student')),
            state TEXT NOT NULL CHECK(state IN ('active','disabled')), revision INTEGER NOT NULL CHECK(revision>0),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(space_id,user_id))''',
        '''CREATE TABLE education_student_grants(
            id TEXT PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES users(id),
            teacher_membership_id TEXT NOT NULL REFERENCES education_memberships(id),
            scope TEXT NOT NULL CHECK(scope='all_learning_history_read'),
            state TEXT NOT NULL CHECK(state IN ('active','revoked')), revision INTEGER NOT NULL CHECK(revision>0),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE(student_id,teacher_membership_id))''',
        '''CREATE TABLE education_member_invitations(
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
            space_id TEXT NOT NULL REFERENCES education_spaces(id), space_revision INTEGER NOT NULL,
            issuer_id INTEGER NOT NULL REFERENCES users(id),
            issuer_membership_id TEXT REFERENCES education_memberships(id), issuer_membership_revision INTEGER,
            target_id INTEGER NOT NULL REFERENCES users(id),
            role TEXT NOT NULL CHECK(role IN ('school_admin','teacher','student')),
            state TEXT NOT NULL CHECK(state IN ('pending','consumed','revoked')),
            expires_at TEXT NOT NULL, created_at TEXT NOT NULL)''',
        '''CREATE TABLE education_history_invitations(
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
            teacher_membership_id TEXT NOT NULL REFERENCES education_memberships(id),
            membership_revision INTEGER NOT NULL, space_revision INTEGER NOT NULL,
            student_id INTEGER NOT NULL REFERENCES users(id), expected_grant_revision INTEGER NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('pending','consumed','revoked')),
            expires_at TEXT NOT NULL, created_at TEXT NOT NULL,
            consumed_request_id TEXT, result_id TEXT REFERENCES education_student_grants(id), result_revision INTEGER)''',
        '''CREATE TABLE education_events(
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER NOT NULL REFERENCES users(id),
            request_id TEXT NOT NULL, kind TEXT NOT NULL, target_id TEXT NOT NULL,
            occurred_at TEXT NOT NULL, UNIQUE(actor_id,request_id))''',
        'CREATE INDEX education_members_user ON education_memberships(user_id,state)',
        'CREATE INDEX education_grants_teacher ON education_student_grants(teacher_membership_id,state)',
        'CREATE INDEX education_grants_student ON education_student_grants(student_id,state)',
        'CREATE INDEX education_invites_target ON education_member_invitations(target_id,state)',
        'CREATE INDEX education_history_target ON education_history_invitations(student_id,state)',
        'CREATE TABLE education_schema_versions(version INTEGER PRIMARY KEY)',
    ]
    for statement in statements:
        db.execute(statement)
    db.execute('INSERT INTO education_schema_versions VALUES(1)')
