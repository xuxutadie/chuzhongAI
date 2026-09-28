"""迁移只扩展结构，不破坏已有错题与图片。"""
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path

from app.repositories.learning_route_repository import (
    LearningRouteRepository, backup_database, migrate_learning_schema,
)


class MigrationTests(unittest.TestCase):
    def test_repeat_keeps_old_record(self):
        with sqlite3.connect(':memory:') as db:
            db.execute('CREATE TABLE wrong_questions(id INTEGER PRIMARY KEY, source_image BLOB)')
            db.execute('INSERT INTO wrong_questions VALUES(7, ?)', (b'original-image',))
            migrate_learning_schema(db)
            migrate_learning_schema(db)
            self.assertEqual(db.execute('SELECT * FROM wrong_questions').fetchall(), [(7, b'original-image')])
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_backup_refuses_overwrite_and_restores(self):
        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder)/'source.db', Path(folder)/'backup.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE saved(value TEXT)')
                db.execute("INSERT INTO saved VALUES('keep')")
                db.commit()
            backup_database(source, target)
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(db.execute('SELECT value FROM saved').fetchone()[0], 'keep')
            with self.assertRaises(ValueError):
                backup_database(source, target)

    def test_transaction_rolls_back_all_writes(self):
        with tempfile.TemporaryDirectory() as folder:
            repository = LearningRouteRepository(Path(folder)/'test.db')
            with self.assertRaises(RuntimeError):
                with repository.transaction() as db:
                    migrate_learning_schema(db)
                    raise RuntimeError('模拟中断')
            with repository.read() as db:
                self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='daily_learning_routes'").fetchone())
