import unittest
from admin_test_support import AdminFixture
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository
from app.admin_workspace.errors import AdminError


class AdminTeacherViewsTests(AdminFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        from app.admin_workspace.teacher_views import AdminTeacherViews
        self.views=AdminTeacherViews(self.repo)
        with self.repo.transaction() as db: migrate_knowledge_schema(db)
        self.knowledge=KnowledgeRepository(self.path)
        self.book=self.knowledge.create('textbooks',self.actor,{'title':'数学教材','grade':'七年级','api_key':'secret-should-not-leak','file_path':'private'})

    def test_white_list_and_no_business_write(self):
        with self.repo.read() as db: before=list(db.iterdump())
        result=self.views.knowledge(self.actor,self.actor,'textbooks')
        self.assertEqual(result['total'],1)
        self.assertEqual(result['items'][0]['data']['title'],'数学教材')
        self.assertNotIn('secret-should-not-leak',str(result))
        self.assertNotIn('file_path',str(result))
        with self.repo.read() as db: self.assertEqual(before,list(db.iterdump()))

    def test_cross_owner_rejected(self):
        with self.assertRaises(AdminError): self.views.knowledge_detail(self.actor,self.student,'textbooks',self.book['id'])
