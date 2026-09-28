"""经教师审核的范围和有限原文片段；禁止以模型自报年级代替检查。"""
from app.schemas.teacher_knowledge import CourseScope
from .repository import KnowledgeError
from .textbooks import source_excerpt,validate_mapping


def system_catalog():
    from app.services.student_workspace_service import REGISTERED_COURSE_CATALOG
    return [{'id':chapter['id'],'title':chapter['title'],'grade':str(course['grade']),
             'edition':course['textbook_version'],'semester':course['semester'],
             'knowledge_points':[dict(point) for point in chapter['knowledge_points']]}
            for course in REGISTERED_COURSE_CATALOG if course['subject']=='数学' for chapter in course['chapters']]


class ScopeService:
    def __init__(self,repo): self.repo=repo

    def resolve(self,owner_id,scope,*,db=None):
        scope=CourseScope.model_validate(scope)
        if db is None:
            with self.repo.read() as connection: return self.resolve(owner_id,scope,db=connection)
        if not scope.chapter_version_ids or not scope.knowledge_point_ids or not all([scope.grade,scope.edition,scope.semester]):
            raise KnowledgeError('请先选择已审核教材章节和知识点')
        points=set(); prerequisites=set(); excerpts=[]; versions=[]
        for identifier in scope.chapter_version_ids:
            version=self.repo.owned('chapter_versions',owner_id,identifier,db=db)
            data=version['data']
            validate_mapping(data)
            book=self.repo.owned('textbooks',owner_id,data['textbook_id'],db=db)
            chapter=self.repo.owned('chapters',owner_id,data['chapter_id'],db=db)
            if version['archived'] or book['archived'] or chapter['archived'] or data['status']!='reviewed':
                raise KnowledgeError('出题范围包含未审核或已归档章节')
            if chapter['data']['current_version_id']!=identifier: raise KnowledgeError('教材章节已更新，请重新选择范围',409)
            if any(data[k]!=getattr(scope,k) for k in ('grade','edition','semester')): raise KnowledgeError('教材版本、年级或学期不一致')
            points.update(data['knowledge_point_ids']); prerequisites.update(data['prerequisite_ids'])
            versions.append({'id':identifier,'revision':version['revision']})
            for source in data['sources']:
                excerpt=source_excerpt(self.repo,owner_id,source,db=db)
                # 人工补充也属于教师审核的教材解释，保留独立标记。
                excerpt['teacher_notes']=data.get('notes','')
                excerpts.append(excerpt)
        if not set(scope.knowledge_point_ids).issubset(points) or not set(scope.prerequisite_ids).issubset(points|prerequisites):
            raise KnowledgeError('知识点或前置知识不在已审核范围内')
        if not prerequisites.issubset(set(scope.prerequisite_ids)|set(scope.knowledge_point_ids)):
            raise KnowledgeError('请确认本章节要求的前置知识')
        if sum(len(e['text'])+len(e['teacher_notes']) for e in excerpts)>40000:
            raise KnowledgeError('本次教材范围过大，请按章节分批生成')
        return {'scope':scope.model_dump(),'versions':versions,'excerpts':excerpts}

    def select_references(self,owner_id,scope,version_ids,*,db=None):
        if db is None:
            with self.repo.read() as connection: return self.select_references(owner_id,scope,version_ids,db=connection)
        scope=CourseScope.model_validate(scope)
        self.resolve(owner_id,scope,db=db)
        result=[]
        for identifier in dict.fromkeys(version_ids):
            version=self.repo.owned('question_versions',owner_id,identifier,db=db)
            question=self.repo.owned('questions',owner_id,version['parent_id'],db=db)
            data=version['data']; qs=data['scope']
            self.resolve(owner_id,qs,db=db)
            if question['archived'] or data['status']!='reviewed' or question['data']['current_version_id']!=identifier:
                raise KnowledgeError('参考题已修订、归档或尚未审核')
            if any(qs[k]!=getattr(scope,k) for k in ('grade','edition','semester')) or not set(qs['knowledge_point_ids']).issubset(scope.knowledge_point_ids):
                raise KnowledgeError('参考题不在本次范围内')
            if not set(qs['prerequisite_ids']).issubset(set(scope.prerequisite_ids)|set(scope.knowledge_point_ids)):
                raise KnowledgeError('参考题需要未选择的前置知识')
            result.append(version)
        return result
