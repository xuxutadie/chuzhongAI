import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from admin_test_support import AdminFixture
from app.main import app
from app.api.routes.student_workspace import get_student_workspace_service


class AdminAPITests(AdminFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_student_workspace_service]=lambda:self.workspace
        self.addCleanup(app.dependency_overrides.clear)
        self.client=TestClient(app)
        self.addCleanup(self.client.close)
        self.headers={'Authorization':'Bearer '+self.auth['access_token']}

    def test_account_flow_and_permissions(self):
        path='/api/v1/admin/accounts'
        self.assertEqual(self.client.get(path).status_code,401)
        student=self.workspace.login(username='student-one',password=self.password)
        self.assertEqual(self.client.get(path,headers={'Authorization':'Bearer '+student['access_token'],'X-Role':'admin'}).status_code,403)
        result=self.client.get(path,headers=self.headers)
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['total'],2)
        self.assertIn('no-store',result.headers['cache-control'])
        bad=self.client.get(path,headers=self.headers|{'X-AI-Coach-Expected-User-Id':'999'})
        self.assertEqual(bad.status_code,409)
        self.assertEqual(self.client.get(path+'?limit=999',headers=self.headers).status_code,422)
        created=self.client.post(path,headers=self.headers,json=self.payload(username='api-teacher',display_name='老师',role='teacher',password=self.password))
        self.assertEqual(created.status_code,201,created.text)
        self.assertNotIn('password',created.text)

    def test_views_reject_writes_and_no_auth(self):
        base=f'/api/v1/admin/views/students/{self.student}'
        self.assertEqual(self.client.get(base,headers=self.headers).status_code,200)
        self.assertEqual(self.client.post(base,headers=self.headers,json={}).status_code,405)
        self.assertEqual(self.client.get(base+'/history?kind=wrong-questions',headers=self.headers).status_code,200)
        self.assertEqual(self.client.get(base+'/assessments/missing/pdf',headers=self.headers).status_code,404)

    def test_teacher_knowledge_without_migration_is_not_empty(self):
        base=f'/api/v1/admin/views/teachers/{self.actor}'
        self.assertEqual(self.client.get(base,headers=self.headers).status_code,200)
        result=self.client.get(base+'/knowledge/textbooks',headers=self.headers)
        self.assertEqual(result.status_code,503)

    def test_revoked_session_cannot_finish_queued_write(self):
        from app.admin_workspace.accounts import AdminAccounts
        original = AdminAccounts.create_account
        def revoke_then_write(service, actor_id, payload):
            # 模拟鉴权后，另一管理员修改此账号，旧请求随后进入写事务。
            with self.repo.transaction() as db:
                db.execute('UPDATE users SET auth_version=auth_version+1 WHERE id=?',(actor_id,))
                db.execute('DELETE FROM sessions WHERE user_id=?',(actor_id,))
            return original(service, actor_id, payload)
        with patch.object(AdminAccounts,'create_account',revoke_then_write):
            result=self.client.post('/api/v1/admin/accounts',headers=self.headers,
                json=self.payload(username='queued-admin',display_name='排队请求',role='admin',password=self.password))
        self.assertEqual(result.status_code,401,result.text)
        with self.repo.read() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM users WHERE username='queued-admin'").fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM admin_action_events').fetchone()[0],0)

    def test_missing_or_damaged_submitted_report_is_readable_error(self):
        from app.services.transition_diagnosis import DiagnosisService
        diagnosis=DiagnosisService(self.path)
        diagnosis.save_profile(self.student,0,{'nickname':'学生','grade':'七年级','textbook':'北师大','school_name':'测试学校','class_name':'一班'},True)
        attempt=diagnosis.start(self.student)
        diagnosis.submit(self.student,attempt['id'],0)
        base=f'/api/v1/admin/views/students/{self.student}'
        for raw,notice in [(None,'报告缺失'),('broken','报告损坏'),('{}','报告损坏'),('[]','报告损坏')]:
            with self.subTest(raw=raw):
                with self.repo.transaction() as db:
                    db.execute('UPDATE diagnosis_attempts SET report_json=? WHERE id=?',(raw,attempt['id']))
                with self.repo.read() as db: before=list(db.iterdump())
                history=self.client.get(base+'/history?kind=reports',headers=self.headers)
                self.assertEqual(history.status_code,200,history.text)
                self.assertIn(notice,history.json()['items'][0].get('report_notice',''))
                for suffix in ('','/pdf'):
                    response=self.client.get(base+'/assessments/'+attempt['id']+suffix,headers=self.headers)
                    self.assertEqual(response.status_code,409,response.text)
                    self.assertIn(notice,response.json()['detail'])
                with self.repo.read() as db: self.assertEqual(before,list(db.iterdump()))


if __name__=='__main__': unittest.main()
