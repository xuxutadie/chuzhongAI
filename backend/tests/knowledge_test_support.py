"""知识库服务层测试工具，不访问项目正式数据库。"""
import sqlite3
import tempfile
from pathlib import Path
from contextlib import closing
from app.teacher_knowledge.repository import KnowledgeRepository
from app.teacher_knowledge.schema import migrate_knowledge_schema


class KnowledgeFixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'knowledge.db'
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('CREATE TABLE users(id INTEGER PRIMARY KEY,role TEXT)')
            db.executemany('INSERT INTO users VALUES(?,?)',[(1,'teacher'),(2,'teacher'),(3,'student'),(4,'admin')])
            db.commit()
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
            migrate_knowledge_schema(db)
            db.commit()
        self.repo = KnowledgeRepository(self.path)
