import unittest
from types import SimpleNamespace
from knowledge_test_support import KnowledgeFixture
from app.teacher_knowledge.teacher_ai import TeacherKnowledgeAI
from app.teacher_knowledge.repository import KnowledgeError
from app.services.personal_api_vault import PersonalAPIVault
from app.core.config import Settings


class IdentityStore:
    def __init__(self,repo): self.repo=repo; self.database_path=repo.path
    def get_user_by_id(self,identifier):
        with self.repo.read() as db:
            row=db.execute('SELECT * FROM users WHERE id=?',(identifier,)).fetchone()
            return dict(row) if row else None


class AITests(KnowledgeFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.ai=TeacherKnowledgeAI(IdentityStore(self.repo),Settings(_env_file=None))
        self.payload={'enabled':True,'provider':'DeepSeek','api_base_url':'https://api.deepseek.com/v1','model':'deepseek-chat','api_key':'private-test-only'}

    def test_teacher_uses_only_own_encrypted_config(self):
        status=self.ai.save_config(1,'llm',self.payload)
        self.assertTrue(status['llm']['configured'])
        self.assertNotIn('private-test-only',str(status))
        self.assertEqual(self.ai.resolve(1,'llm').api_key,'private-test-only')
        encrypted=list(self.ai.vault.directory.glob('*.dpapi'))[0].read_bytes()
        self.assertNotIn(b'private-test-only',encrypted)
        self.assertFalse(self.ai.status(2)['llm']['configured'])

    def test_student_key_and_admin_fallback_denied(self):
        with self.assertRaises(KnowledgeError): self.ai.save_config(3,'llm',self.payload)
        with self.assertRaises(KnowledgeError): self.ai.resolve(2,'llm')

    def test_status_errors_and_logs_never_include_key(self):
        with self.assertRaises(Exception) as caught:
            self.ai.save_config(1,'llm',{**self.payload,'api_base_url':'https://untrusted.invalid'})
        self.assertNotIn('private-test-only',str(caught.exception))
        self.ai.save_config(1,'llm',self.payload)
        self.ai.clear_config(1,'llm')
        self.assertFalse(self.ai.status(1)['llm']['configured'])

    def test_admin_uses_existing_server_config(self):
        self.assertEqual(self.ai.status(4)['mode'],'server')
        with self.assertRaises(KnowledgeError): self.ai.save_config(4,'llm',self.payload)

    def test_unconfigured_preserves_manual_workflow(self):
        self.assertFalse(self.ai.status(1)['llm']['configured'])
        with self.assertRaises(KnowledgeError): self.ai.generate(1,{'instruction':'test'})
