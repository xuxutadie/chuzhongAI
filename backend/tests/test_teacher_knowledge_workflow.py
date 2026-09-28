import unittest
import sqlite3
import tempfile
from pathlib import Path
from contextlib import closing
from io import BytesIO
from docx import Document
from teacher_test_support import TeacherFixture
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository
from app.teacher_knowledge.files import KnowledgeFiles
from app.teacher_knowledge.textbooks import TextbookService
from app.teacher_knowledge.questions import QuestionService
from app.teacher_knowledge.question_sets import QuestionSetService
from app.teacher_knowledge.generation import GenerationService
from app.teacher_knowledge.jobs import KnowledgeJobs
from app.schemas.teacher_knowledge import CourseScope,QuestionInput,GenerationRequest
from test_teacher_knowledge_generation import FakeAI
from scripts.verify_teacher_knowledge import verify


class WorkflowTests(TeacherFixture,unittest.TestCase):
    def test_upload_review_generate_save_workflow(self):
        auth=self.register_teacher().json();owner=auth['user']['id']
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('BEGIN IMMEDIATE');migrate_knowledge_schema(db);db.commit()
        repo=KnowledgeRepository(self.path);textbooks=TextbookService(repo);questions=QuestionService(repo)
        doc=Document();doc.add_paragraph('有理数的加法：同号相加，符号不变，绝对值相加。计算 2+3=5。')
        stream=BytesIO();doc.save(stream)
        file=KnowledgeFiles(repo).store(owner,'验收教材.docx',stream.getvalue())
        extracted=KnowledgeFiles(repo).extract(owner,file['id'])
        book=textbooks.create(owner,{'title':'验收教材','grade':'7','edition':'北师大版','semester':'上册'})
        textbooks.attach_file(owner,book['id'],file['id'],book['revision'])
        chapter=textbooks.save_chapter(owner,book['id'],{'title':'有理数','sources':[{'file_id':file['id'],'kind':'paragraph','index':extracted['sources'][0]['index']}],'knowledge_point_ids':['g7u-c2-rational']},None)
        textbooks.review_chapter(owner,chapter['id'],chapter['revision'])
        scope=CourseScope(grade='7',edition='北师大版',semester='上册',chapter_version_ids=[chapter['id']],knowledge_point_ids=['g7u-c2-rational'])
        original=questions.save(owner,QuestionInput(prompt='计算 2+3',answer={'value':'5'},explanation='2加3等于5',scope=scope))
        questions.review(owner,original['id'],original['revision'],['answer','scope','figure'])
        service=GenerationService(repo,FakeAI());job=service.enqueue(owner,GenerationRequest(request_id='workflow',scope=scope,reference_version_ids=[original['id']]))
        service.process_generation(KnowledgeJobs(repo).claim('qa'))
        generated=repo.owned('question_versions',owner,KnowledgeJobs(repo).status(owner,job['id'])['result_ids'][0])
        questions.review(owner,generated['id'],generated['revision'],['answer','scope','figure'])
        sets=QuestionSetService(repo);group=sets.save(owner,'test',[original['id'],generated['id']],scope)
        sets.review(owner,group['id'],group['revision'])
        preview=sets.preview(owner,group['id']);self.assertEqual(len(preview['questions']),2);self.assertFalse(preview['published'])
        other=self.register_teacher('qa-other').json()
        denied=self.client.get('/api/v1/teacher/knowledge/question-sets/'+group['id']+'/preview',headers=self.headers(other))
        self.assertEqual(denied.status_code,404)
        self.assertFalse(repo.listing('questions',other['user']['id'])['items'])

    def test_rehearsal_preserves_existing_database(self):
        with tempfile.TemporaryDirectory() as output:
            result=verify(self.path,Path(output))
            self.assertEqual(result['integrity'],'ok')
            self.assertTrue(result['original_unchanged'])
            with closing(sqlite3.connect(self.path)) as db:
                self.assertIsNone(db.execute("SELECT name FROM sqlite_master WHERE name='tk_files'").fetchone())
