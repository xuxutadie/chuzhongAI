"""题目不可变内容版本和显式人工审核。"""
import re
import json
from decimal import Decimal,InvalidOperation
from app.schemas.teacher_knowledge import QuestionInput
from .repository import KnowledgeError,pack
from .scope import ScopeService
from .textbooks import source_excerpt


def answer_checks(data):
    issues=[]
    for key,label in [('prompt','题干'),('answer','答案'),('explanation','解析')]:
        if not data.get(key): issues.append('请补充'+label)
    if data['needs_figure'] and not data['asset_ids']: issues.append('请补充实际配图，不能仅用文字描述')
    kind=data['response_type']; answer=data['answer']; options=data['options']
    if kind in ('single','multiple'):
        identifiers=[o.get('id') for o in options]
        if len(options)<2 or len(set(identifiers))!=len(identifiers) or any(not o.get('text') or not o.get('id') for o in options):
            issues.append('选项须完整且编号不重复')
        values=answer.get('values',[]) if kind=='multiple' else [answer.get('value')]
        if not values or any(v not in identifiers for v in values) or len(set(values))!=len(values): issues.append('答案须对应有效选项')
    elif kind=='boolean':
        if type(answer.get('value')) is not bool: issues.append('判断题答案应为正确或错误')
    elif not str(answer.get('value','')).strip(): issues.append('请填写参考答案')
    if kind=='worked' and not data['rubric']: issues.append('解答题须填写评分要点')
    # 仅校验明确的两数算式，不推断自然语言题意，不执行表达式代码。
    match=re.fullmatch(r'\s*(?:计算\s*)?([+-]?\d{1,8}(?:\.\d{1,6})?)\s*([+−\-×*/÷])\s*([+-]?\d{1,8}(?:\.\d{1,6})?)\s*[。？?=]?\s*',data['prompt'])
    if match and kind=='short' and answer.get('value'):
        a,op,b=match.groups(); a=Decimal(a); b=Decimal(b)
        try:
            expected=a+b if op=='+' else a-b if op in ('-','−') else a*b if op in ('×','*') else a/b
            if Decimal(str(answer['value']))!=expected: issues.append('算式答案与独立计算结果不一致')
        except (InvalidOperation,ZeroDivisionError): issues.append('算式或答案无法核验，请修正')
    return issues


class QuestionService:
    def __init__(self,repo): self.repo=repo

    def copy_provenance(self,owner_id,previous,new_id,db):
        clause,args=self.repo.scope_clause(db,owner_id)
        for row in db.execute('SELECT data FROM tk_generation_sources WHERE owner_id=? AND parent_id=?'+clause,[owner_id,previous,*args]).fetchall():
            source=json.loads(row['data'])
            self.repo.create('generation_sources',owner_id,{**source,'question_version_id':new_id,'revised_from':previous},parent_id=new_id,db=db)

    def save(self,owner_id,content,question_id=None,expected_revision=None,*,db=None):
        if db is None:
            with self.repo.transaction() as connection:
                return self.save(owner_id,content,question_id,expected_revision,db=connection)
        data=QuestionInput.model_validate(content).model_dump()
        for identifier in data['asset_ids']:
            asset=self.repo.owned('files',owner_id,identifier,db=db)
            if asset['archived'] or not asset['data'].get('asset') or asset['data'].get('media_type')!='image/png':
                raise KnowledgeError('配图须为已提取的安全图片')
        for source in data['sources']: source_excerpt(self.repo,owner_id,source,db=db)
        data.update(status='draft',checks=answer_checks(data))
        if question_id:
            parent=self.repo.owned('questions',owner_id,question_id,db=db)
            if parent['archived']: raise KnowledgeError('请先恢复归档题目')
            if parent['revision']!=expected_revision: raise KnowledgeError('题目已修改，请重新读取',409)
        else:
            parent=self.repo.create('questions',owner_id,data,db=db); question_id=parent['id']
        version=self.repo.create('question_versions',owner_id,data,parent_id=question_id,db=db)
        previous=parent['data'].get('current_version_id')
        if previous:
            self.copy_provenance(owner_id,previous,version['id'],db)
        self.repo.update('questions',owner_id,question_id,{**data,'current_version_id':version['id']},parent['revision'],db=db)
        return version

    def review(self,owner_id,version_id,expected_revision,confirmed_checks):
        with self.repo.transaction() as db:
            version=self.repo.owned('question_versions',owner_id,version_id,db=db)
            parent=self.repo.owned('questions',owner_id,version['parent_id'],db=db)
            if parent['archived'] or parent['data']['current_version_id']!=version_id: raise KnowledgeError('请审核当前未归档版本',409)
            if not {'answer','scope','figure'}.issubset(confirmed_checks): raise KnowledgeError('请核对答案、知识范围与图文一致性')
            data=version['data']; issues=answer_checks(data)
            if issues: raise KnowledgeError('；'.join(issues))
            ScopeService(self.repo).resolve(owner_id,data['scope'],db=db)
            for source in data['sources']: source_excerpt(self.repo,owner_id,source,db=db)
            for identifier in data['asset_ids']:
                if self.repo.owned('files',owner_id,identifier,db=db)['archived']: raise KnowledgeError('配图已归档')
            data={**data,'status':'reviewed','checks':[]}
            result=self.repo.update('question_versions',owner_id,version_id,data,expected_revision,db=db)
            self.repo.update('questions',owner_id,parent['id'],{**data,'current_version_id':version_id},parent['revision'],db=db)
            self.repo.create('review_events',owner_id,{'kind':'question','version_id':version_id,'confirmed_checks':confirmed_checks},db=db)
            return result

    def split(self,owner_id,version_id,children,expected_revision):
        if not 2<=len(children)<=20: raise KnowledgeError('每次可拆成 2—20 道题')
        with self.repo.transaction() as db:
            original=self.repo.owned('question_versions',owner_id,version_id,db=db)
            if original['revision']!=expected_revision: raise KnowledgeError('原题已更新',409)
            result=[self.save(owner_id,QuestionInput.model_validate({**QuestionInput.model_validate(child).model_dump(),
                    'sources':original['data']['sources']}),db=db) for child in children]
            for version in result:self.copy_provenance(owner_id,version_id,version['id'],db)
            return result

    def merge(self,owner_id,version_ids,content,expected_revisions):
        if not 2<=len(version_ids)<=20 or len(version_ids)!=len(expected_revisions): raise KnowledgeError('请选择 2—20 道题合并')
        with self.repo.transaction() as db:
            sources={}
            for identifier,revision in zip(version_ids,expected_revisions):
                version=self.repo.owned('question_versions',owner_id,identifier,db=db)
                if version['revision']!=revision: raise KnowledgeError('原题已更新',409)
                for source in version['data']['sources']: sources[pack(source)]=source
            values=QuestionInput.model_validate(content).model_dump(); values['sources']=list(sources.values())
            merged=self.save(owner_id,QuestionInput.model_validate(values),db=db)
            for identifier in version_ids:self.copy_provenance(owner_id,identifier,merged['id'],db)
            return merged

    def set_archived(self,owner_id,question_id,archived,expected_revision):
        item=self.repo.owned('questions',owner_id,question_id)
        return self.repo.update('questions',owner_id,question_id,item['data'],expected_revision,archived=archived)
