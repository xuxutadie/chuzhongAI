"""知识库的迁移、隔离和输入边界；全部使用临时数据库。"""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from pydantic import ValidationError
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository, KnowledgeError
from app.schemas.teacher_knowledge import SourceRef, QuestionInput, GenerationRequest


class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / 'test.db'
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('CREATE TABLE users(id INTEGER PRIMARY KEY, role TEXT)')
            db.executemany('INSERT INTO users VALUES (?,?)', [(1,'teacher'),(2,'teacher'),(3,'admin')])
            db.commit()
        self.repo = KnowledgeRepository(self.path)

    def migrate(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
            migrate_knowledge_schema(db)
            db.commit()

    def test_migration_idempotent_and_preserves_records(self):
        self.assertFalse(self.repo.ready())
        self.migrate()
        self.migrate()
        self.assertTrue(self.repo.ready())
        with self.repo.read() as db:
            self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM users')], [(1,'teacher'),(2,'teacher'),(3,'admin')])
            self.assertEqual(db.execute('SELECT count(*) FROM tk_schema_versions').fetchone()[0], 1)
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_transaction_rolls_back_schema(self):
        db = sqlite3.connect(self.path)
        try:
            db.execute('BEGIN IMMEDIATE')
            migrate_knowledge_schema(db)
            db.rollback()
        finally:
            db.close()
        self.assertFalse(self.repo.ready())

    def test_owned_queries_are_scoped(self):
        self.migrate()
        item = self.repo.create('textbooks', 1, {'title':'数学'})
        self.assertEqual(self.repo.owned('textbooks', 1, item['id'])['data']['title'], '数学')
        for owner in [2,3]:
            with self.assertRaises(KnowledgeError) as caught:
                self.repo.owned('textbooks', owner, item['id'])
            self.assertEqual(caught.exception.status_code, 404)
        with self.assertRaises(ValueError):
            self.repo.owned('users', 1, item['id'])

    def test_dto_rejects_owner_and_unknown_fields(self):
        with self.assertRaises(ValidationError):
            QuestionInput(owner_id=2)
        for values in [{'index':0}, {'index':1,'region':[0,0,2,1]}, {'index':1,'region':[.8,0,.1,1]}]:
            with self.assertRaises(ValidationError):
                SourceRef(file_id='a', kind='page', **values)
        with self.assertRaises(ValidationError):
            GenerationRequest(request_id='x', original_count=0, variant_count=51)

    def test_conflict_does_not_overwrite(self):
        self.migrate()
        item = self.repo.create('textbooks', 1, {'title':'原始'})
        self.repo.update('textbooks', 1, item['id'], {'title':'修订'}, 1)
        with self.assertRaises(KnowledgeError) as caught:
            self.repo.update('textbooks', 1, item['id'], {'title':'过时'}, 1)
        self.assertEqual(caught.exception.status_code,409)
        self.assertEqual(self.repo.owned('textbooks',1,item['id'])['data']['title'],'修订')
