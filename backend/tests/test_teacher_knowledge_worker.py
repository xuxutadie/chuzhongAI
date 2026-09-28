import unittest
from knowledge_test_support import KnowledgeFixture
from app.teacher_knowledge.worker import KnowledgeWorker
from app.teacher_knowledge.jobs import KnowledgeJobs


class WorkerTests(KnowledgeFixture,unittest.TestCase):
    def test_failure_is_visible_and_secret_not_logged(self):
        job=KnowledgeJobs(self.repo).enqueue(1,'import',{'units':[{'file_id':'gone'}]},'w')
        worker=KnowledgeWorker(self.repo)
        self.assertTrue(worker.run_one('test'))
        state=KnowledgeJobs(self.repo).status(1,job['id'])
        self.assertEqual(state['state'],'failed')
        self.assertTrue(state['errors'])
        self.assertFalse(worker.run_one('test'))
