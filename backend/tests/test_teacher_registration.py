import unittest
from teacher_test_support import TeacherFixture


class TeacherRegistrationTests(TeacherFixture, unittest.TestCase):
    def test_admin_created_students_are_linked_after_migration(self):
        admin = self.workspace.repository.create_first_admin(username='admin-test',password_hash='not-a-login',display_name='管理员')
        one = self.workspace.repository.create_user(username='managed-one',password_hash='not-a-login',display_name='学生',role='student',created_by=admin['id'])
        batch = self.workspace.repository.create_students_batch(created_by=admin['id'],students=[{'username':'managed-two','password_hash':'not-a-login','display_name':'学生2'}])
        with self.repo.read() as db:
            ids = [r[0] for r in db.execute("SELECT student_id FROM teacher_student_links WHERE teacher_id=? AND status='active' ORDER BY student_id",(admin['id'],))]
        self.assertEqual(ids,[one['id'],batch[0]['id']])

    def test_teacher_registers_without_admin_access(self):
        response = self.register_teacher()
        self.assertEqual(response.status_code, 201, response.text)
        auth = response.json()
        self.assertEqual(auth['user']['role'], 'teacher')
        headers = self.headers(auth)
        self.assertEqual(self.client.get('/api/v1/auth/me', headers=headers).json()['user']['id'], auth['user']['id'])
        self.assertEqual(self.client.get('/api/v1/teacher/students', headers=headers).status_code, 403)
        profile = self.client.get('/api/v1/teacher/profile', headers=headers)
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json()['school_name'], '实验中学')
        for key in ('password', 'password_hash', 'created_by'):
            self.assertNotIn(key, auth['user'])

    def test_duplicate_and_invalid_registration_do_not_create_accounts(self):
        self.assertEqual(self.register_teacher().status_code, 201)
        self.assertEqual(self.register_teacher('TEACHER-ONE').status_code, 409)
        base = dict(username='new-teacher', password='password123', display_name='老师',
                    school_name='学校', teaching_classes=['七年级1班'])
        for patch in ({'role':'admin'}, {'created_by':1}, {'school_name':' '}, {'teaching_classes':[]}, {'display_name':' '}):
            result = self.client.post('/api/v1/auth/register-teacher', json={**base, **patch})
            self.assertEqual(result.status_code, 422, result.text)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM users').fetchone()[0], 1)

    def test_profile_failure_rolls_back_account(self):
        with self.repo.transaction() as db:
            db.execute("CREATE TRIGGER reject_profile BEFORE INSERT ON teacher_profiles BEGIN SELECT RAISE(ABORT,'profile-failure'); END")
        from app.services.teacher_accounts import TeacherAccounts
        with self.assertRaises(Exception):
            TeacherAccounts(self.repo, self.workspace).register(username='failure-test', password='password123',
                display_name='老师', school_name='学校', teaching_classes=['七1班'])
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM users').fetchone()[0], 0)

    def test_profile_is_private_and_validated(self):
        auth_response = self.register_teacher()
        self.assertEqual(auth_response.status_code, 201, auth_response.text)
        headers = self.headers(auth_response.json())
        self.assertEqual(self.client.get('/api/v1/teacher/profile').status_code, 401)
        result = self.client.put('/api/v1/teacher/profile', headers=headers,
            json={'school_name':'新的学校', 'teaching_classes':['七2班']})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['school_name'], '新的学校')
