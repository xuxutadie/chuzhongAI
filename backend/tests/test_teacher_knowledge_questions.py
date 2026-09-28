import unittest
from knowledge_test_support import KnowledgeFixture
from test_teacher_knowledge_textbooks import make_chapter
from app.teacher_knowledge.questions import QuestionService
from app.teacher_knowledge.repository import KnowledgeError
from app.schemas.teacher_knowledge import QuestionInput


class QuestionTests(KnowledgeFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        _,self.file,_,self.scope=make_chapter(self.repo)
        self.service=QuestionService(self.repo)
        self.content=QuestionInput(prompt='计算 2 + 3',answer={'value':'5'},explanation='相加得 5',scope=self.scope)

    def create(self): return self.service.save(1,self.content,None,None)

    def review(self,q): return self.service.review(1,q['id'],q['revision'],['answer','scope','figure'])

    def test_edits_create_unreviewed_revision(self):
        q=self.review(self.create())
        parent=self.repo.owned('questions',1,q['parent_id'])
        newer=self.service.save(1,self.content.model_copy(update={'prompt':'计算 3 + 2'}),q['parent_id'],parent['revision'])
        self.assertNotEqual(q['id'],newer['id'])
        self.assertEqual(newer['data']['status'],'draft')
        self.assertEqual(self.repo.owned('question_versions',1,q['id'])['data']['status'],'reviewed')

    def test_missing_answer_figure_scope_blocks_review(self):
        for change in [{'answer':{}},{'needs_figure':True},{'explanation':''},{'answer':{'value':'7'}}]:
            q=self.service.save(1,self.content.model_copy(update=change),None,None)
            with self.assertRaises(KnowledgeError): self.review(q)

    def test_foreign_assets_rejected(self):
        foreign=self.repo.create('files',2,{'title':'private.png'})
        with self.assertRaises(KnowledgeError):
            self.service.save(1,self.content.model_copy(update={'asset_ids':[foreign['id']]}),None,None)

    def test_split_merge_retains_sources(self):
        source={'file_id':self.file['id'],'kind':'page','index':1}
        content=QuestionInput(**{**self.content.model_dump(),'sources':[source]})
        q=self.service.save(1,content,None,None)
        children=self.service.split(1,q['id'],[self.content,self.content],q['revision'])
        self.assertEqual(children[0]['data']['sources'][0]['file_id'],self.file['id'])
        merged=self.service.merge(1,[c['id'] for c in children],self.content,[c['revision'] for c in children])
        self.assertEqual(len(merged['data']['sources']),1)
        self.assertIsNotNone(self.repo.owned('question_versions',1,q['id']))

    def test_revision_conflict_preserves_author_edit(self):
        q=self.create(); parent=self.repo.owned('questions',1,q['parent_id'])
        self.service.save(1,self.content,q['parent_id'],parent['revision'])
        with self.assertRaises(KnowledgeError): self.service.save(1,self.content,q['parent_id'],parent['revision'])
