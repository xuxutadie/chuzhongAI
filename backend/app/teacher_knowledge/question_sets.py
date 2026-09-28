"""教师题组保存和预览；本阶段不提供学生发布接口。"""
from app.schemas.teacher_knowledge import CourseScope
from .repository import KnowledgeError
from .scope import ScopeService


class QuestionSetService:
    def __init__(self,repo): self.repo=repo

    def save(self,owner_id,purpose,question_version_ids,scope,set_id=None,expected_revision=None):
        if purpose not in ('test','practice') or not 1<=len(question_version_ids)<=50 or len(set(question_version_ids))!=len(question_version_ids):
            raise KnowledgeError('题组用途或题量不合法，须为 1—50 道不同题目')
        with self.repo.transaction() as db:
            resolved=ScopeService(self.repo).resolve(owner_id,scope,db=db)
            for identifier in question_version_ids:
                version=self.repo.owned('question_versions',owner_id,identifier,db=db)
                question=self.repo.owned('questions',owner_id,version['parent_id'],db=db)
                if question['archived']: raise KnowledgeError('题目已归档')
                qs=version['data']['scope']; scope_values=resolved['scope']
                if any(qs[k]!=scope_values[k] for k in ('grade','edition','semester')) or not set(qs['knowledge_point_ids']).issubset(scope_values['knowledge_point_ids']):
                    raise KnowledgeError('题组包含范围外题目')
            data={'title':'测试题组' if purpose=='test' else '练习题组','purpose':purpose,'question_version_ids':question_version_ids,
                  'scope':resolved['scope'],'scope_versions':resolved['versions'],'status':'draft'}
            if set_id: return self.repo.update('question_sets',owner_id,set_id,data,expected_revision,db=db)
            return self.repo.create('question_sets',owner_id,data,db=db)

    def review(self,owner_id,set_id,expected_revision):
        with self.repo.transaction() as db:
            group=self.repo.owned('question_sets',owner_id,set_id,db=db)
            ScopeService(self.repo).select_references(owner_id,group['data']['scope'],group['data']['question_version_ids'],db=db)
            updated=self.repo.update('question_sets',owner_id,set_id,{**group['data'],'status':'reviewed'},expected_revision,db=db)
            self.repo.create('review_events',owner_id,{'kind':'question_set','set_id':set_id,'revision':updated['revision']},db=db)
            return updated

    def preview(self,owner_id,set_id):
        with self.repo.read() as db:
            group=self.repo.owned('question_sets',owner_id,set_id,db=db)
            questions=[self.repo.owned('question_versions',owner_id,i,db=db) for i in group['data']['question_version_ids']]
            return {'group':group,'questions':questions,'teacher_only':True,'published':False}
