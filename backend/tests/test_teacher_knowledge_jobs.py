import unittest
from datetime import datetime,timezone,timedelta
from knowledge_test_support import KnowledgeFixture
from app.teacher_knowledge.jobs import KnowledgeJobs
from app.teacher_knowledge.repository import KnowledgeError


class JobTests(KnowledgeFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.jobs=KnowledgeJobs(self.repo)
        self.now=datetime.now(timezone.utc)

    def enqueue(self,key='one'):
        return self.jobs.enqueue(1,'import',{'units':[{'file_id':'one'},{'file_id':'two'}]},key)

    def test_two_workers_cannot_commit_same_unit(self):
        job=self.enqueue()
        lease=self.jobs.claim('a',self.now)
        self.assertIsNone(self.jobs.claim('b',self.now))
        self.jobs.complete_unit(job['id'],lease['lease_token'],{'ids':['first']})
        with self.assertRaises(KnowledgeError):
            self.jobs.complete_unit(job['id'],lease['lease_token'],{'ids':['duplicate']})
        self.assertEqual(self.jobs.status(1,job['id'])['completed_units'],1)

    def test_expired_lease_rejects_late_result(self):
        job=self.enqueue()
        old=self.jobs.claim('a',self.now)
        newer=self.jobs.claim('b',self.now+timedelta(minutes=10))
        self.assertNotEqual(old['lease_token'],newer['lease_token'])
        with self.assertRaises(KnowledgeError):
            self.jobs.complete_unit(job['id'],old['lease_token'],{'ids':[]})

    def test_limits_idempotency_cancel_retry(self):
        job=self.enqueue()
        self.assertEqual(job['id'],self.enqueue()['id'])
        second=self.enqueue('two'); self.enqueue('three')
        first_lease=self.jobs.claim('a',self.now)
        second_lease=self.jobs.claim('b',self.now)
        self.assertIsNone(self.jobs.claim('c',self.now))
        self.jobs.fail_unit(first_lease['id'],first_lease['lease_token'],'识别失败')
        remaining=self.jobs.claim('c',self.now)
        self.jobs.complete_unit(remaining['id'],remaining['lease_token'],{'ids':['ok']})
        state=self.jobs.status(1,job['id'])
        self.assertEqual(state['state'],'partial_failed')
        retried=self.jobs.retry_failed(1,job['id'],state['revision'])
        self.assertEqual(retried['completed_units'],1)
        state=self.jobs.status(1,second['id'])
        self.jobs.cancel(1,second['id'],state['revision'])
        with self.assertRaises(KnowledgeError):
            self.jobs.complete_unit(second['id'],second_lease['lease_token'],{'ids':[]})

    def test_wrong_owner_cannot_read_job(self):
        job=self.enqueue()
        with self.assertRaises(KnowledgeError): self.jobs.status(2,job['id'])
