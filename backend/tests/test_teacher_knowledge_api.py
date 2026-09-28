import sqlite3
import unittest
from contextlib import closing
from teacher_test_support import TeacherFixture
from app.teacher_knowledge.schema import migrate_knowledge_schema


class APITests(TeacherFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.auth=self.register_teacher().json()
        self.headers_one=self.headers(self.auth)

    def migrate(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('BEGIN IMMEDIATE'); migrate_knowledge_schema(db); db.commit()

    def test_unmigrated_read_returns_503_without_writes(self):
        result=self.client.get('/api/v1/teacher/knowledge/textbooks',headers=self.headers_one)
        self.assertEqual(result.status_code,503)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertIsNone(db.execute("SELECT 1 FROM sqlite_master WHERE name='tk_files'").fetchone())

    def test_student_and_cross_teacher_access_denied(self):
        self.migrate()
        path='/api/v1/teacher/knowledge'
        created=self.client.post(path+'/textbooks',headers=self.headers_one,json={'title':'教材','grade':'7','edition':'北师大版','semester':'上册'})
        self.assertEqual(created.status_code,201,created.text)
        book=created.json(); other=self.register_teacher('teacher-two').json()
        result=self.client.get(path+'/textbooks/'+book['id'],headers=self.headers(other))
        self.assertEqual(result.status_code,404)
        self.assertEqual(self.client.get(path+'/textbooks',headers=self.headers(other)).json()['total'],0)
        self.assertEqual(self.client.get(path+'/textbooks').status_code,401)
        self.assertEqual(self.client.get(path+'/textbooks',headers=self.headers_one).headers['cache-control'],'private, no-store')

    def test_wrong_role_and_no_publish(self):
        self.migrate()
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("UPDATE users SET role='student' WHERE username='teacher-one'"); db.commit()
        result=self.client.get('/api/v1/teacher/knowledge/textbooks',headers=self.headers_one)
        self.assertEqual(result.status_code,403)

    def test_upload_rejects_path_and_oversize(self):
        self.migrate()
        result=self.client.post('/api/v1/teacher/knowledge/files?filename=../bad.png',headers=self.headers_one,content=b'abc')
        self.assertEqual(result.status_code,422)

    def test_jobs_list_is_private_and_empty(self):
        self.migrate()
        response=self.client.get('/api/v1/teacher/knowledge/jobs',headers=self.headers_one)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['items'],[])
