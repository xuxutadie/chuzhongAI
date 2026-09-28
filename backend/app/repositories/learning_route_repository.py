"""每日路线的数据边界；建表需显式执行，不在读取页面时迁移。"""
from contextlib import contextmanager, closing
from pathlib import Path
import sqlite3


def migrate_learning_schema(db: sqlite3.Connection) -> None:
    sql = Path(__file__).with_name('learning_route_schema.sql').read_text(encoding='utf-8')
    # execute 不会像 executescript 那样提前提交调用方事务。
    for statement in sql.split(';'):
        if statement.strip():
            db.execute(statement)
    db.execute('CREATE TABLE IF NOT EXISTS learning_schema_versions(version INTEGER PRIMARY KEY)')
    db.execute('INSERT OR IGNORE INTO learning_schema_versions VALUES(1)')


def backup_database(source: Path, target: Path) -> None:
    source, target = source.resolve(), target.resolve()
    if not source.is_file() or target.exists() or source == target:
        raise ValueError('原库不存在、备份目标已存在或与原库相同')
    # 独占创建防止覆盖另一份备份；SQLite backup 正确处理 WAL。
    with target.open('xb'):
        pass
    with closing(sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)) as src:
        with closing(sqlite3.connect(target)) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('备份校验未通过')


class LearningRouteRepository:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def read(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        with self.read() as db:
            db.execute('BEGIN IMMEDIATE')
            try:
                yield db
                db.commit()
            except BaseException:
                db.rollback()
                raise

    def ready(self):
        with self.read() as db:
            return db.execute("SELECT name FROM sqlite_master WHERE name='learning_schema_versions'").fetchone() is not None
