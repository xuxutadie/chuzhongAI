"""教师数据连接：读取不创建文件或表，写入使用短事务。"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class TeacherRepository:
    def __init__(self, path):
        self.path = Path(path).resolve()

    @contextmanager
    def read(self):
        db = sqlite3.connect(f'{self.path.as_uri()}?mode=ro', uri=True, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN')
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(f'{self.path.as_uri()}?mode=rw', uri=True, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def ready(self):
        if not self.path.is_file():
            return False
        with self.read() as db:
            table = db.execute("SELECT name FROM sqlite_master WHERE name='teacher_schema_versions'").fetchone()
            return bool(table and db.execute('SELECT 1 FROM teacher_schema_versions WHERE version=1').fetchone())
