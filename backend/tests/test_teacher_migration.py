"""教师迁移必须保留旧账号、外键、会话和已撤销关系。"""
import importlib
import sqlite3
import unittest


class TeacherMigrationTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript('''
          CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','student','parent','coach')),
            grade TEXT, auth_version INTEGER NOT NULL DEFAULT 1,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
          CREATE TABLE sessions(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), token_hash TEXT);
          CREATE TABLE saved_work(user_id INTEGER REFERENCES users(id), content TEXT);
          CREATE INDEX custom_user_grade ON users(grade);
          INSERT INTO users VALUES(1,'admin','hash-a','老师','admin',NULL,2,NULL,'2026-09-26');
          INSERT INTO users VALUES(2,'student','hash-s','学生','student','初一',3,1,'2026-09-26');
          INSERT INTO users VALUES(3,'personal','hash-p','自主','student','初一',1,NULL,'2026-09-26');
          INSERT INTO sessions VALUES(1,2,'session-hash');
          INSERT INTO saved_work VALUES(2,'保留作答');
          UPDATE sqlite_sequence SET seq=90 WHERE name='users';
        ''')
        self.before = {t: self.db.execute(f'SELECT * FROM {t}').fetchall() for t in ['users','sessions','saved_work']}

    def tearDown(self):
        self.db.close()

    def migrate(self):
        module = importlib.import_module('app.repositories.teacher_schema')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            module.migrate_teacher_schema(self.db)
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def test_migrate_preserves_ids_sessions_and_ai_mode(self):
        self.migrate()
        for table, rows in self.before.items():
            self.assertEqual(self.db.execute(f'SELECT * FROM {table}').fetchall(), rows)
        self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertIsNotNone(self.db.execute("SELECT name FROM sqlite_master WHERE name='custom_user_grade'").fetchone())
        self.assertEqual(self.db.execute('SELECT teacher_id, student_id FROM teacher_student_links').fetchall(), [(1,2)])
        cursor = self.db.execute("INSERT INTO users(username,password_hash,display_name,role,created_at) VALUES('new','hash','新老师','teacher','now')")
        self.assertEqual(cursor.lastrowid, 91)

    def test_failure_rolls_back(self):
        module = importlib.import_module('app.repositories.teacher_schema')
        self.db.execute('BEGIN IMMEDIATE')
        module.migrate_teacher_schema(self.db)
        self.db.rollback()
        self.assertEqual(self.db.execute('SELECT * FROM users').fetchall(), self.before['users'])
        self.assertIsNone(self.db.execute("SELECT name FROM sqlite_master WHERE name='teacher_student_links'").fetchone())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO users(username,password_hash,display_name,role,created_at) VALUES('bad','h','x','teacher','now')")

    def test_repeat_keeps_revoked_links(self):
        self.migrate()
        self.db.execute("UPDATE teacher_student_links SET status='revoked',revoked_at='now'")
        self.db.commit()
        self.migrate()
        self.assertEqual(self.db.execute('SELECT status FROM teacher_student_links').fetchall(), [('revoked',)])

    def test_unknown_column_is_not_silently_lost(self):
        self.db.execute('ALTER TABLE users ADD COLUMN future_data TEXT')
        with self.assertRaises(ValueError):
            self.migrate()
        self.assertIn('future_data', [r[1] for r in self.db.execute('PRAGMA table_info(users)')])

    def test_foreign_keys_must_be_disabled_before_transaction(self):
        self.db.execute('PRAGMA foreign_keys=ON')
        with self.assertRaises(ValueError):
            self.migrate()
        self.assertEqual(self.db.execute('SELECT * FROM saved_work').fetchall(), self.before['saved_work'])
