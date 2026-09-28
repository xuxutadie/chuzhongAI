import unittest
from datetime import datetime,timezone
from knowledge_test_support import KnowledgeFixture
from test_teacher_knowledge_textbooks import make_chapter
from app.schemas.teacher_knowledge import QuestionInput,GenerationRequest
from app.teacher_knowledge.questions import QuestionService
from app.teacher_knowledge.jobs import KnowledgeJobs
from app.teacher_knowledge.generation import GenerationService
from app.teacher_knowledge.repository import KnowledgeError


class FakeAI:
    """只替代外部模型，持久化、审核、来源检查仍运行真实服务。"""
    def __init__(self): self.requests=[]; self.change=None
    def resolve(self,owner,kind): return None
    def generate(self,owner,context):
        self.requests.append(context)
        if self.change: self.change()
        return {'question':{'prompt':'计算 4 + 3','answer':{'value':'7'},'explanation':'4 加 3 等于 7',
                'response_type':'short','knowledge_point_ids':['g7u-c2-rational'],'prerequisite_ids':[],
                'reference_ids':context['reference_ids'],'needs_figure':False}}


class GenerationTests(KnowledgeFixture,unittest.TestCase):
    def setUp(self):
        super().setUp()
        _,_,_,self.scope=make_chapter(self.repo)
        self.ai=FakeAI(); self.service=GenerationService(self.repo,self.ai)
        q=QuestionService(self.repo).save(1,QuestionInput(prompt='计算 2 + 3',answer={'value':'5'},explanation='2+3=5',scope=self.scope))
        self.q=QuestionService(self.repo).review(1,q['id'],q['revision'],['answer','scope','figure'])
        self.request=GenerationRequest(request_id='req',scope=self.scope,reference_version_ids=[q['id']])

    def test_variants_record_real_references_and_changed_solution(self):
        job=self.service.enqueue(1,self.request)
        lease=KnowledgeJobs(self.repo).claim('test')
        self.service.process_generation(lease)
        state=KnowledgeJobs(self.repo).status(1,job['id'])
        self.assertEqual(state['completed_units'],1)
        q=self.repo.owned('question_versions',1,state['result_ids'][0])
        self.assertEqual(q['data']['answer']['value'],'7')
        self.assertEqual(q['data']['status'],'draft')
        provenance=self.repo.listing('generation_sources',1)['items'][0]['data']
        self.assertEqual(provenance['reference_ids'],[self.q['id']])

    def test_empty_bank_requires_explicit_fill_and_reviewed_scope(self):
        request=self.request.model_copy(update={'reference_version_ids':[]})
        with self.assertRaises(KnowledgeError): self.service.enqueue(1,request)
        self.service.enqueue(1,request.model_copy(update={'allow_ai_fill':True}))

    def test_partial_bank_never_silently_fills(self):
        with self.assertRaises(KnowledgeError): self.service.enqueue(1,self.request.model_copy(update={'original_count':3}))

    def test_unknown_citation_and_out_of_scope_rejected(self):
        job=self.service.enqueue(1,self.request)
        lease=KnowledgeJobs(self.repo).claim('test')
        original=self.ai.generate
        self.ai.generate=lambda owner,context:{'question':{**original(owner,context)['question'],'reference_ids':['fake']}}
        with self.assertRaises(KnowledgeError): self.service.process_generation(lease)
        self.assertEqual(KnowledgeJobs(self.repo).status(1,job['id'])['completed_units'],0)

    def test_archive_during_generation_returns_reviewable_conflict(self):
        self.service.enqueue(1,self.request)
        lease=KnowledgeJobs(self.repo).claim('test')
        def change():
            parent=self.repo.owned('questions',1,self.q['parent_id'])
            QuestionService(self.repo).set_archived(1,parent['id'],True,parent['revision'])
        self.ai.change=change
        with self.assertRaises(KnowledgeError): self.service.process_generation(lease)

    def test_cancel_prevents_model_call_and_final_commit(self):
        job=self.service.enqueue(1,self.request); lease=KnowledgeJobs(self.repo).claim('test')
        state=KnowledgeJobs(self.repo).status(1,job['id'])
        KnowledgeJobs(self.repo).cancel(1,job['id'],state['revision'])
        with self.assertRaises(KnowledgeError): self.service.process_generation(lease)
        self.assertEqual(self.ai.requests,[])

    def test_prompt_has_no_student_identity_or_other_owner_data(self):
        self.service.enqueue(1,self.request); lease=KnowledgeJobs(self.repo).claim('test')
        self.service.process_generation(lease)
        prompt=str(self.ai.requests[0])
        for forbidden in ['owner_id','student_id','username','school_name','api_key']:
            self.assertNotIn(forbidden,prompt)

    def test_edit_preserves_generation_provenance(self):
        job=self.service.enqueue(1,self.request)
        self.service.process_generation(KnowledgeJobs(self.repo).claim('test'))
        version=self.repo.owned('question_versions',1,KnowledgeJobs(self.repo).status(1,job['id'])['result_ids'][0])
        parent=self.repo.owned('questions',1,version['parent_id'])
        content={k:v for k,v in version['data'].items() if k not in ('status','checks')}
        content['explanation']='核对后补充的解析'
        revised=QuestionService(self.repo).save(1,content,parent['id'],parent['revision'])
        source=self.repo.listing('generation_sources',1,filters={'parent_id':revised['id']})['items']
        self.assertEqual(len(source),1)
        self.assertEqual(source[0]['data']['reference_ids'],[self.q['id']])

    def test_word_formula_is_never_silently_omitted(self):
        file=self.repo.create('files',1,{'title':'formula.docx','extraction':{'index_kind':'paragraph','sources':[{'index':1,'text':'计算：','formulas':['<math>2+3</math>'],'warnings':['verify_formula'],'asset_refs':[]}]}})
        job=KnowledgeJobs(self.repo).enqueue(1,'import',{'mode':'questions','units':[{'file_id':file['id']}]},'formula')
        with self.assertRaisesRegex(KnowledgeError,'公式对象'):
            self.service.process_import(KnowledgeJobs(self.repo).claim('test'))
        self.assertFalse(self.ai.requests)
