import unittest
from knowledge_test_support import KnowledgeFixture
from test_teacher_knowledge_textbooks import make_chapter
from app.teacher_knowledge.questions import QuestionService
from app.teacher_knowledge.question_sets import QuestionSetService
from app.teacher_knowledge.repository import KnowledgeError
from app.schemas.teacher_knowledge import QuestionInput


class SetTests(KnowledgeFixture,unittest.TestCase):
    def test_sets_require_each_question_review_and_frozen_versions(self):
        _,_,_,scope=make_chapter(self.repo)
        questions=QuestionService(self.repo); sets=QuestionSetService(self.repo)
        content=QuestionInput(prompt='计算 2 + 3',answer={'value':'5'},explanation='相加得 5',scope=scope)
        q=questions.save(1,content)
        group=sets.save(1,'practice',[q['id']],scope)
        with self.assertRaises(KnowledgeError): sets.review(1,group['id'],group['revision'])
        questions.review(1,q['id'],1,['answer','scope','figure'])
        group=sets.review(1,group['id'],group['revision'])
        parent=self.repo.owned('questions',1,q['parent_id'])
        newer=questions.save(1,content,q['parent_id'],parent['revision'])
        self.assertEqual(sets.preview(1,group['id'])['questions'][0]['id'],q['id'])
        group=sets.save(1,'practice',[newer['id']],scope,group['id'],group['revision'])
        self.assertEqual(group['data']['status'],'draft')
        questions.review(1,newer['id'],newer['revision'],['answer','scope','figure'])
        updated=sets.review(1,group['id'],group['revision'])
        self.assertEqual(updated['data']['status'],'reviewed')
        self.assertEqual(sets.preview(1,group['id'])['questions'][0]['id'],newer['id'])
        with self.assertRaises(KnowledgeError): sets.preview(2,group['id'])
