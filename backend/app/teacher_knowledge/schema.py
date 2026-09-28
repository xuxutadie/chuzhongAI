"""知识库显式迁移：不改写既有用户或学习记录。"""
import sqlite3

TABLES = ('files', 'textbooks', 'chapters', 'chapter_versions', 'questions',
          'question_versions', 'generation_sources', 'question_sets', 'review_events')


def migrate_knowledge_schema(db: sqlite3.Connection) -> None:
    if not db.in_transaction:
        raise ValueError('迁移必须由调用方开启事务')
    db.execute('CREATE TABLE IF NOT EXISTS tk_schema_versions(version INTEGER PRIMARY KEY)')
    if db.execute('SELECT 1 FROM tk_schema_versions WHERE version=1').fetchone():
        return
    for name in TABLES:
        db.execute(f'''CREATE TABLE tk_{name}(
            id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
            data TEXT NOT NULL CHECK(json_valid(data)), revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
            archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN(0,1)),
            parent_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            UNIQUE(owner_id,id))''')
        db.execute(f'CREATE INDEX tk_{name}_owner ON tk_{name}(owner_id,archived,updated_at)')
    db.execute('''CREATE TABLE tk_jobs(
        id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
        payload TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
        revision INTEGER NOT NULL DEFAULT 1, lease_token TEXT, lease_until REAL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner_id,request_id))''')
    db.execute('''CREATE TABLE tk_job_units(
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES tk_jobs(id), position INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', payload TEXT NOT NULL, result TEXT, error TEXT,
        UNIQUE(job_id,position))''')
    db.execute('CREATE INDEX tk_jobs_poll ON tk_jobs(state,lease_until)')
    # SQLite JSON 索引同时约束归属和摘要，不能跨教师复用私有文件。
    db.execute("CREATE UNIQUE INDEX tk_files_digest ON tk_files(owner_id,json_extract(data,'$.sha256'))")
    db.execute('INSERT INTO tk_schema_versions VALUES(1)')


def migrate_knowledge_spaces(db: sqlite3.Connection) -> None:
    """只升级结构，不猜测旧资源归属，也不启用学校权限切换。"""
    if not db.in_transaction:
        raise ValueError('迁移必须由调用方开启事务')
    if db.execute('SELECT 1 FROM tk_schema_versions WHERE version=2').fetchone():
        return
    for name in TABLES:
        db.execute(f'ALTER TABLE tk_{name} ADD COLUMN space_id TEXT REFERENCES education_spaces(id)')
        db.execute(f'CREATE INDEX tk_{name}_space ON tk_{name}(space_id,owner_id,archived,updated_at)')
    db.execute('DROP INDEX tk_files_digest')
    db.execute("CREATE UNIQUE INDEX tk_files_digest ON tk_files(space_id,owner_id,json_extract(data,'$.sha256'))")
    # SQLite 不能移除表内 UNIQUE，显式重建任务表以加入空间幂等边界。
    # 保留全部任务及单元 ID、内容和结果；外键始终开启。
    db.execute('ALTER TABLE tk_job_units RENAME TO tk_job_units_legacy')
    db.execute('ALTER TABLE tk_jobs RENAME TO tk_jobs_legacy')
    db.execute('''CREATE TABLE tk_jobs(
        id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
        payload TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
        revision INTEGER NOT NULL DEFAULT 1, lease_token TEXT, lease_until REAL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        space_id TEXT REFERENCES education_spaces(id), membership_id TEXT REFERENCES education_memberships(id),
        space_revision INTEGER, membership_revision INTEGER, auth_version INTEGER,
        UNIQUE(space_id,owner_id,request_id))''')
    db.execute('''INSERT INTO tk_jobs(id,owner_id,kind,payload,request_id,state,revision,lease_token,lease_until,created_at,updated_at)
        SELECT id,owner_id,kind,payload,request_id,state,revision,lease_token,lease_until,created_at,updated_at FROM tk_jobs_legacy''')
    db.execute('''CREATE TABLE tk_job_units(
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES tk_jobs(id), position INTEGER NOT NULL,
        state TEXT NOT NULL DEFAULT 'queued', payload TEXT NOT NULL, result TEXT, error TEXT,
        UNIQUE(job_id,position))''')
    db.execute('INSERT INTO tk_job_units SELECT * FROM tk_job_units_legacy')
    db.execute('DROP TABLE tk_job_units_legacy')
    db.execute('DROP TABLE tk_jobs_legacy')
    db.execute('CREATE INDEX tk_jobs_poll ON tk_jobs(state,lease_until)')
    db.execute('CREATE INDEX tk_jobs_space ON tk_jobs(space_id,owner_id,created_at)')
    db.execute('''CREATE TABLE education_ai_allocations(
        space_id TEXT NOT NULL REFERENCES education_spaces(id), capability TEXT NOT NULL CHECK(capability IN ('llm','ocr')),
        enabled INTEGER NOT NULL CHECK(enabled IN(0,1)), revision INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL, PRIMARY KEY(space_id,capability))''')
    db.execute('INSERT INTO tk_schema_versions VALUES(2)')
