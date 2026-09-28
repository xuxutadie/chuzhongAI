import unittest
from knowledge_test_support import KnowledgeFixture
from app.teacher_knowledge.textbooks import TextbookService
from app.teacher_knowledge.scope import ScopeService,system_catalog
from app.teacher_knowledge.repository import KnowledgeError
from app.schemas.teacher_knowledge import CourseScope


def make_chapter(repo,owner=1,reviewed=True):
    service=TextbookService(repo)
    book=service.create(owner,{'title':'数学七上','grade':'7','edition':'北师大版','semester':'上册'})
    file=repo.create('files',owner,{'title':'a.pdf','extraction':{'index_kind':'page','sources':[{'index':1,'text':'有理数包括整数和分数','asset_refs':[]}]}})
    book=service.attach_file(owner,book['id'],file['id'],book['revision'])
    chapter=service.save_chapter(owner,book['id'],{'title':'有理数','sources':[{'file_id':file['id'],'kind':'page','index':1}],
        'knowledge_point_ids':['g7u-c2-rational'],'prerequisite_ids':[]},None)
    if reviewed: chapter=service.review_chapter(owner,chapter['id'],chapter['revision'])
    scope=CourseScope(grade='7',edition='北师大版',semester='上册',chapter_version_ids=[chapter['id']],knowledge_point_ids=['g7u-c2-rational'])
    return book,file,chapter,scope


class TextbookTests(KnowledgeFixture,unittest.TestCase):
    def test_catalog_includes_all_six_verified_math_chapters(self):
        catalog=system_catalog()
        self.assertEqual(len(catalog),6)
        self.assertIn('g7u-shapes-solid',[p['id'] for c in catalog for p in c['knowledge_points']])

    def test_multiple_files_keep_source_identity(self):
        book,file,chapter,scope=make_chapter(self.repo)
        service=TextbookService(self.repo)
        other=self.repo.create('files',1,{'title':'b.pdf','extraction':{'index_kind':'page','sources':[{'index':1,'text':'数轴','asset_refs':[]}]}})
        book=service.attach_file(1,book['id'],other['id'],book['revision'])
        new=service.save_chapter(1,book['id'],{'title':'数轴','sources':[{'file_id':other['id'],'kind':'page','index':1}],
            'knowledge_point_ids':['g7u-c2-rational'],'prerequisite_ids':[]},None)
        self.assertNotEqual(chapter['data']['sources'][0]['file_id'],new['data']['sources'][0]['file_id'])
        self.assertEqual(len(book['data']['file_ids']),2)

    def test_unreviewed_and_foreign_chapters_block_generation(self):
        book,file,chapter,scope=make_chapter(self.repo,reviewed=False)
        for owner in [1,2,4]:
            with self.assertRaises(KnowledgeError): ScopeService(self.repo).resolve(owner,scope)
        TextbookService(self.repo).review_chapter(1,chapter['id'],1)
        self.assertIn('有理数',ScopeService(self.repo).resolve(1,scope)['excerpts'][0]['text'])

    def test_missing_prerequisite_and_mixed_edition_rejected(self):
        _,_,_,scope=make_chapter(self.repo)
        for change in [{'edition':'人教版'},{'grade':'8'},{'prerequisite_ids':['grade8']},{'knowledge_point_ids':['unknown']}]:
            with self.assertRaises(KnowledgeError): ScopeService(self.repo).resolve(1,scope.model_copy(update=change))

    def test_invalid_source_cannot_be_reviewed(self):
        book,_,_,_=make_chapter(self.repo)
        with self.assertRaises(KnowledgeError):
            TextbookService(self.repo).save_chapter(1,book['id'],{'title':'假章节','sources':[{'file_id':'not-owned','kind':'page','index':1}],
                'knowledge_point_ids':['g7u-c2-rational']},None)

    def test_unknown_mapping_cannot_be_reviewed(self):
        book,file,_,_=make_chapter(self.repo)
        service=TextbookService(self.repo)
        draft=service.save_chapter(1,book['id'],{'title':'未知知识点','sources':[{'file_id':file['id'],'kind':'page','index':1}],'knowledge_point_ids':['does-not-exist']},None)
        with self.assertRaises(KnowledgeError):service.review_chapter(1,draft['id'],draft['revision'])
