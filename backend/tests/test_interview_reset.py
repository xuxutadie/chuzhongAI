"""维护重置只改指定学生的访谈，并先留下可恢复的资料。"""
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from scripts.reset_interview_profiles import reset_profiles


class InterviewResetTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "test.sqlite3"
        self.backup = Path(self.directory.name) / "backup.sqlite3"
        with closing(sqlite3.connect(self.path)) as db, db:
            db.executescript('''
                CREATE TABLE users(id INTEGER PRIMARY KEY,display_name TEXT,role TEXT);
                INSERT INTO users VALUES(2,'学生甲','student'),(5,'学生乙','student'),(1,'教师','admin');
                CREATE TABLE diagnosis_profiles(user_id INTEGER PRIMARY KEY,fields_json TEXT,confirmed INTEGER,revision INTEGER,updated_at TEXT);
                INSERT INTO diagnosis_profiles VALUES(2,'{"nickname":"甲"}',0,7,'old'),(5,'{"nickname":"乙"}',1,9,'old'),(8,'{}',1,1,'old');
                CREATE TABLE diagnosis_attempts(id TEXT,user_id INTEGER,report_json TEXT);
                INSERT INTO diagnosis_attempts VALUES('old-report',5,'unchanged');
                CREATE TABLE wrong_questions(id INTEGER,user_id INTEGER,content TEXT);
                INSERT INTO wrong_questions VALUES(1,5,'unchanged');
            ''')

    def test_reset_backups_exact_profiles_and_preserves_other_records(self):
        reset_profiles(self.path, {2: '学生甲', 5: '学生乙'}, self.backup)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT fields_json,confirmed,revision FROM diagnosis_profiles WHERE user_id=5').fetchone(), ('{}',0,10))
            self.assertEqual(db.execute('SELECT revision FROM diagnosis_profiles WHERE user_id=8').fetchone(), (1,))
            self.assertEqual(db.execute('SELECT report_json FROM diagnosis_attempts').fetchone(), ('unchanged',))
            self.assertEqual(db.execute('SELECT content FROM wrong_questions').fetchone(), ('unchanged',))
        with closing(sqlite3.connect(self.backup)) as db:
            self.assertEqual(db.execute('SELECT fields_json,confirmed,revision FROM diagnosis_profiles WHERE user_id=5').fetchone(), ('{"nickname":"乙"}',1,9))

    def test_mismatched_identity_never_resets(self):
        with self.assertRaises(ValueError):
            reset_profiles(self.path, {2:'姓名不符'}, self.backup)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT revision FROM diagnosis_profiles WHERE user_id=2').fetchone(), (7,))

    def test_existing_backup_is_not_overwritten(self):
        self.backup.touch()
        with self.assertRaises(FileExistsError):
            reset_profiles(self.path, {2:'学生甲'}, self.backup)
