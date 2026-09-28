"""学校资源隔离回归：测试数据库与附件均为临时合成资料。"""
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from education_test_support import EducationFixture
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository, KnowledgeError
from app.teacher_knowledge.files import KnowledgeFiles
from app.teacher_knowledge.jobs import KnowledgeJobs


class EducationKnowledgeTests(EducationFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.a = self.seed_space()
        self.b = self.seed_space()
        with self.repo.transaction() as db:
            migrate_knowledge_schema(db)
        # 功能缺失时明确报告迁移入口缺失；不得修改真实数据库。
        from app.teacher_knowledge.schema import migrate_knowledge_spaces
        with self.repo.transaction() as db:
            migrate_knowledge_spaces(db)
            db.execute('INSERT INTO education_schema_versions VALUES(2)')
        self.ra = KnowledgeRepository(self.repo.path, identity=self.teacher_identity, context=self.a)
        self.rb = KnowledgeRepository(self.repo.path, identity=self.teacher_identity, context=self.b)

    def test_same_teacher_cannot_read_update_or_list_another_school(self):
        item = self.ra.create('textbooks', self.teacher, {'title': '甲校教材'})
        self.assertEqual(self.ra.listing('textbooks', self.teacher)['total'], 1)
        self.assertEqual(self.rb.listing('textbooks', self.teacher)['total'], 0)
        for action in [lambda: self.rb.owned('textbooks', self.teacher, item['id']),
                       lambda: self.rb.update('textbooks', self.teacher, item['id'], {}, 1, archived=True)]:
            with self.assertRaises(KnowledgeError) as caught: action()
            self.assertEqual(caught.exception.status_code, 404)

    def test_foreign_parent_and_owner_are_rejected(self):
        parent = self.ra.create('textbooks', self.teacher, {'title': '甲校'})
        with self.assertRaises(KnowledgeError):
            self.rb.create('chapters', self.teacher, {'title': '越校章节'}, parent_id=parent['id'])
        with self.assertRaises(KnowledgeError):
            self.ra.create('questions', self.student, {'prompt': '伪造所属人'})
        self.assertEqual(self.rb.listing('chapters', self.teacher)['total'], 0)

    def test_file_digest_dedup_is_scoped(self):
        content = b'%PDF-1.4\nsynthetic'
        fa, fb = KnowledgeFiles(self.ra), KnowledgeFiles(self.rb)
        a = fa.store(self.teacher, 'example.pdf', content)
        b = fb.store(self.teacher, 'example.pdf', content)
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(fa.store(self.teacher, 'again.pdf', content)['id'], a['id'])
        self.assertEqual(fb.read(self.teacher, b['id'])[0], content)
        with self.assertRaises(KnowledgeError): fb.read(self.teacher, a['id'])

    def test_unscoped_old_resources_are_quarantined(self):
        with self.repo.transaction() as db:
            db.execute("INSERT INTO tk_questions(id,owner_id,data,created_at,updated_at) VALUES('old',?,'{}','now','now')", (self.teacher,))
        self.assertEqual(self.ra.listing('questions', self.teacher)['total'], 0)
        with self.assertRaises(KnowledgeError): self.ra.owned('questions', self.teacher, 'old')
        with self.assertRaises(KnowledgeError):
            KnowledgeRepository(self.repo.path).listing('questions', self.teacher)

    def test_job_request_dedup_and_status_are_scoped(self):
        payload = {'units': [{'file_id': 'synthetic'}]}
        a = KnowledgeJobs(self.ra).enqueue(self.teacher, 'import', payload, 'same-request')
        b = KnowledgeJobs(self.rb).enqueue(self.teacher, 'import', payload, 'same-request')
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(KnowledgeJobs(self.ra).enqueue(self.teacher, 'import', payload, 'same-request')['id'], a['id'])
        with self.assertRaises(KnowledgeError): KnowledgeJobs(self.rb).status(self.teacher, a['id'])

    def test_disabled_member_cannot_read_or_save_resources(self):
        item = self.ra.create('questions', self.teacher, {'prompt': '已有题目'})
        with self.repo.transaction() as db:
            db.execute("UPDATE education_memberships SET state='disabled',revision=revision+1 WHERE id=?", (self.a.membership_id,))
        with self.assertRaises(KnowledgeError): self.ra.owned('questions', self.teacher, item['id'])
        with self.assertRaises(KnowledgeError): self.ra.create('questions', self.teacher, {})

    def test_revoked_job_is_not_claimed_or_written_back(self):
        jobs = KnowledgeJobs(self.ra)
        pending = jobs.enqueue(self.teacher, 'import', {'units': [{}]}, 'pending')
        queue = KnowledgeJobs(KnowledgeRepository(self.repo.path))
        active = queue.claim('test')
        self.assertEqual(active['id'], pending['id'])
        with self.repo.transaction() as db:
            db.execute('UPDATE education_memberships SET revision=revision+1 WHERE id=?', (self.a.membership_id,))
        with self.assertRaises(KnowledgeError): queue.complete_unit(active['id'], active['lease_token'], {'ids': ['late']})
        self.assertIsNone(queue.claim('test'))
        with self.repo.read() as db:
            self.assertIsNone(db.execute('SELECT result FROM tk_job_units WHERE job_id=?', (active['id'],)).fetchone()[0])
            self.assertEqual(db.execute('SELECT state FROM tk_jobs WHERE id=?', (active['id'],)).fetchone()[0], 'cancelled')

    def test_http_entry_requires_scope_and_filters_jobs_and_files(self):
        from app.main import app
        from app.api.routes.student_workspace import get_student_workspace_service
        from test_education_api import EducationAPITests
        app.dependency_overrides[get_student_workspace_service] = lambda: self.workspace
        self.addCleanup(app.dependency_overrides.clear)
        client = TestClient(app)
        self.addCleanup(client.close)
        # 不进入应用 lifespan，避免测试启动使用默认路径的后台工作器。
        a = EducationAPITests.headers(self.teacher_auth, self.a)
        b = EducationAPITests.headers(self.teacher_auth, self.b)
        plain = EducationAPITests.headers(self.teacher_auth)
        base = '/api/v1/teacher/knowledge'
        self.assertEqual(client.get(base+'/catalog', headers=plain).status_code, 409)
        self.assertEqual(client.get(base+'/ai', headers=plain).status_code, 409)
        item = self.ra.create('textbooks', self.teacher, {'title':'甲校教材'})
        self.assertEqual(client.get(base+'/textbooks', headers=a).json()['total'], 1)
        self.assertEqual(client.get(base+'/textbooks', headers=b).json()['total'], 0)
        self.assertEqual(client.get(base+'/textbooks/'+item['id'], headers=b).status_code, 404)
        task = KnowledgeJobs(self.ra).enqueue(self.teacher, 'import', {'units':[{}]}, 'http')
        self.assertEqual(client.get(base+'/jobs', headers=a).json()['total'], 1)
        self.assertEqual(client.get(base+'/jobs', headers=b).json()['total'], 0)
        self.assertEqual(client.get(base+'/jobs/'+task['id'], headers=b).status_code, 404)

    def test_ai_credentials_do_not_cross_spaces_or_inherit_admin_service(self):
        from app.teacher_knowledge.teacher_ai import TeacherKnowledgeAI
        from app.teacher_knowledge.worker import IdentityReader
        from app.core.config import Settings
        a = TeacherKnowledgeAI(IdentityReader(self.ra), Settings(_env_file=None), knowledge_repository=self.ra)
        b = TeacherKnowledgeAI(IdentityReader(self.rb), Settings(_env_file=None), knowledge_repository=self.rb)
        value = {'enabled':True,'provider':'DeepSeek','api_base_url':'https://api.deepseek.com/v1',
                 'model':'deepseek-chat','api_key':'synthetic-school-only'}
        self.assertTrue(a.save_config(self.teacher,'llm',value)['llm']['configured'])
        self.assertEqual(a.resolve(self.teacher,'llm').api_key,'synthetic-school-only')
        self.assertFalse(b.status(self.teacher)['llm']['configured'])
        admin_context = self.seed_space(self.admin_identity.user_id)
        admin_repo = KnowledgeRepository(self.repo.path, identity=self.admin_identity, context=admin_context)
        admin_ai = TeacherKnowledgeAI(IdentityReader(admin_repo), Settings(_env_file=None), knowledge_repository=admin_repo)
        self.assertEqual(admin_ai.status(self.admin_identity.user_id)['mode'], 'personal')
        with self.assertRaises(KnowledgeError):
            TeacherKnowledgeAI(IdentityReader(self.ra)).status(self.teacher)

    def test_file_read_rechecks_permission_after_loading_bytes(self):
        from pathlib import Path
        files = KnowledgeFiles(self.ra)
        item = files.store(self.teacher,'sample.pdf',b'%PDF-1.4\nsynthetic')
        original = Path.read_bytes
        def revoked_read(path):
            content = original(path)
            with self.repo.transaction() as db:
                db.execute('UPDATE education_memberships SET revision=revision+1 WHERE id=?',(self.a.membership_id,))
            return content
        with patch.object(Path,'read_bytes',revoked_read):
            with self.assertRaises(KnowledgeError): files.read(self.teacher,item['id'])

    def test_ai_discards_external_reply_after_membership_revoked(self):
        from app.teacher_knowledge.teacher_ai import TeacherKnowledgeAI
        from app.teacher_knowledge.worker import IdentityReader
        from app.services.model_connection_test_service import ModelConnectionTestService
        from app.core.config import Settings
        ai = TeacherKnowledgeAI(IdentityReader(self.ra), Settings(_env_file=None), knowledge_repository=self.ra)
        ai.save_config(self.teacher,'llm',{'enabled':True,'provider':'DeepSeek',
            'api_base_url':'https://api.deepseek.com/v1','model':'deepseek-chat','api_key':'synthetic-only'})
        def external_response(*args):
            with self.repo.transaction() as db:
                db.execute('UPDATE education_memberships SET revision=revision+1 WHERE id=?',(self.a.membership_id,))
            return '{"questions":[]}', None
        with patch.object(ModelConnectionTestService,'request_json_completion',external_response):
            with self.assertRaises(KnowledgeError) as caught: ai.generate(self.teacher,{'instruction':'合成测试'})
            self.assertEqual(caught.exception.status_code,409)

    def test_background_import_cannot_save_after_revocation(self):
        from app.teacher_knowledge.generation import GenerationService
        owner = self.teacher
        file = self.ra.create('files',owner,{'extraction':{'index_kind':'page','sources':[
            {'index':1,'text':'计算 1+1','asset_refs':[],'warnings':[]}]}})
        task = KnowledgeJobs(self.ra).enqueue(owner,'import',{'mode':'questions','units':[{'file_id':file['id']}]},'late-import')
        queue = KnowledgeJobs(KnowledgeRepository(self.repo.path))
        lease = queue.claim('test')
        outer = self
        class ExternalAI:
            def generate(self, user, context):
                with outer.repo.transaction() as db:
                    db.execute('UPDATE education_memberships SET revision=revision+1 WHERE id=?',(outer.a.membership_id,))
                return {'questions':[{'prompt':'计算 1+1','answer':{'value':'2'},'explanation':'一加一等于二','source_indexes':[1]}]}
        bound = KnowledgeRepository(self.repo.path,job=lease)
        with self.assertRaises(KnowledgeError): GenerationService(bound,ExternalAI()).process_import(lease)
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM tk_questions').fetchone()[0],0)
            self.assertIsNone(db.execute('SELECT result FROM tk_job_units WHERE job_id=?',(task['id'],)).fetchone()[0])

    def test_only_platform_admin_can_explicitly_allocate_school_ai(self):
        from app.education.ai_allocations import SchoolAIAllocations
        from app.education.errors import EducationError
        from app.teacher_knowledge.teacher_ai import TeacherKnowledgeAI
        from app.teacher_knowledge.worker import IdentityReader
        from app.core.config import Settings
        payload = self.request(enabled=True,expected_revision=0)
        with self.assertRaises(EducationError):
            SchoolAIAllocations(self.repo,self.teacher_identity).set(self.a.space_id,'llm',payload)
        service = SchoolAIAllocations(self.repo,self.admin_identity)
        result = service.set(self.a.space_id,'llm',payload)
        self.assertEqual(result['revision'],1)
        with self.assertRaises(EducationError): service.set(self.a.space_id,'llm',self.request(enabled=False,expected_revision=0))
        ai = TeacherKnowledgeAI(IdentityReader(self.ra),Settings(_env_file=None),knowledge_repository=self.ra)
        self.assertEqual(ai.status(self.teacher)['allocated_capabilities'],['llm'])
        self.assertEqual(service.list(self.b.space_id),[])


class KnowledgeSpaceMigrationTests(EducationFixture, unittest.TestCase):
    def test_populated_migration_preserves_ids_and_rolls_back(self):
        from app.teacher_knowledge.schema import migrate_knowledge_spaces
        with self.repo.transaction() as db: migrate_knowledge_schema(db)
        legacy = KnowledgeRepository(self.repo.path)
        resource = legacy.create('questions',self.teacher,{'prompt':'原题'})
        job = KnowledgeJobs(legacy).enqueue(self.teacher,'import',{'units':[{}]},'original')
        with self.repo.read() as db:
            original_job = tuple(db.execute('SELECT * FROM tk_jobs').fetchone())
            original_unit = tuple(db.execute('SELECT * FROM tk_job_units').fetchone())
        with self.assertRaisesRegex(RuntimeError,'rollback'):
            with self.repo.transaction() as db:
                migrate_knowledge_spaces(db)
                raise RuntimeError('rollback')
        with self.repo.read() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM tk_jobs').fetchone()), original_job)
            self.assertEqual(tuple(db.execute('SELECT * FROM tk_job_units').fetchone()), original_unit)
        with self.repo.transaction() as db:
            migrate_knowledge_spaces(db)
            migrate_knowledge_spaces(db)
            db.execute('INSERT INTO education_schema_versions VALUES(2)')
        with self.repo.read() as db:
            self.assertEqual(tuple(db.execute('SELECT * FROM tk_jobs').fetchone())[:len(original_job)], original_job)
            self.assertEqual(tuple(db.execute('SELECT * FROM tk_job_units').fetchone()), original_unit)
            self.assertEqual(db.execute('SELECT id,data,space_id FROM tk_questions').fetchone()[0],resource['id'])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertIsNone(KnowledgeJobs(legacy).claim('test'))
        with self.repo.read() as db:
            self.assertEqual(db.execute('SELECT state FROM tk_jobs WHERE id=?',(job['id'],)).fetchone()[0],'cancelled')
