"""有限来源的变式与导入整理；模型只能生产教师待审核候选。"""
from app.schemas.teacher_knowledge import GenerationRequest,QuestionInput,CourseScope
from .repository import KnowledgeError
from .scope import ScopeService
from .questions import QuestionService
from .files import KnowledgeFiles
from .jobs import KnowledgeJobs


class GenerationService:
    def __init__(self,repo,ai):
        self.repo=repo; self.ai=ai; self.jobs=KnowledgeJobs(repo)

    def enqueue(self,owner_id,request):
        request=GenerationRequest.model_validate(request)
        scope=ScopeService(self.repo).resolve(owner_id,request.scope)
        references=ScopeService(self.repo).select_references(owner_id,request.scope,request.reference_version_ids)
        if request.original_count>len(references): raise KnowledgeError(f'已审核原题不足：需要 {request.original_count} 道，当前 {len(references)} 道')
        if request.variant_count and not references and not request.allow_ai_fill: raise KnowledgeError('没有可参考原题，请补充题库或明确允许依据教材生成')
        if request.variant_count: self.ai.resolve(owner_id,'llm')
        units=[{'mode':'original','reference_id':r['id']} for r in references[:request.original_count]]
        units += [{'mode':'variant' if references else 'fill','index':i} for i in range(request.variant_count)]
        payload={'request':request.model_dump(),'scope_versions':scope['versions'],'units':units}
        return self.jobs.enqueue(owner_id,'generate',payload,request.request_id)

    def _inputs(self,job,db):
        self.jobs.assert_lease(db,job['id'],job['lease_token'])
        owner=job['owner_id']; request=GenerationRequest.model_validate(job['payload']['request'])
        scope=ScopeService(self.repo).resolve(owner,request.scope,db=db)
        if scope['versions']!=job['payload']['scope_versions']: raise KnowledgeError('教材范围已更新，请重新发起生成',409)
        references=ScopeService(self.repo).select_references(owner,request.scope,request.reference_version_ids,db=db)
        return request,scope,references

    def process_generation(self,job):
        with self.repo.read() as db:
            request,scope,references=self._inputs(job,db)
        owner=job['owner_id']; unit=job['unit']
        if unit['mode']=='original':
            ids=[unit['reference_id']]
            with self.repo.transaction() as db:
                self._inputs(job,db)
                self.jobs.complete_unit(job['id'],job['lease_token'],{'ids':ids},db=db)
            return {'ids':ids}
        # 轮流参考题型，不把教师整库或学生身份塞入上下文。
        selected=[references[unit['index']%len(references)]] if references else []
        excerpts=scope['excerpts']
        context={'instruction':'生成一道数学变式题。只使用给定范围，更新题干、答案、解析。不得直接复制原题。输出 question 对象：prompt,response_type,options,answer{value 或 values},explanation,rubric,needs_figure,knowledge_point_ids,prerequisite_ids,reference_ids。没有可靠配图时 needs_figure=true，保留待教师补图；不要沿用原图尺寸。',
                 'difficulty':request.difficulty,'response_type':request.response_type,'scope':scope['scope'],
                 'reference_ids':[r['id'] for r in selected],
                 'references':[{'id':r['id'],'prompt':r['data']['prompt'],'answer':r['data']['answer'],
                                'explanation':r['data']['explanation'],'needs_figure':r['data']['needs_figure']} for r in selected],
                 'textbook_excerpts':[{'text':e['text'],'teacher_notes':e['teacher_notes'],'source':{'file_id':e['file_id'],'kind':e['kind'],'index':e['index']}} for e in excerpts]}
        if len(str(context))>60000: raise KnowledgeError('参考内容过多，请缩小范围')
        response=self.ai.generate(owner,context)
        q=response.get('question')
        if not isinstance(q,dict): raise KnowledgeError('模型没有返回有效题目')
        cited=q.pop('reference_ids',[])
        if set(cited)!=set(context['reference_ids']): raise KnowledgeError('模型来源标识不符，请重新生成')
        points=q.pop('knowledge_point_ids',[]); prerequisites=q.pop('prerequisite_ids',[])
        if not points or not set(points).issubset(request.scope.knowledge_point_ids) or not set(prerequisites).issubset(set(request.scope.prerequisite_ids)|set(request.scope.knowledge_point_ids)):
            raise KnowledgeError('模型题目需要范围外知识或未标注知识点')
        if q.get('response_type')!=request.response_type: raise KnowledgeError('模型题型不符合要求')
        if any(q.get('prompt','').strip()==r['data']['prompt'].strip() for r in selected): raise KnowledgeError('模型重复原题，请重试变式')
        # 不接受模型伪造文件引用。新图由教师补充，原图仅保留在原题中用于对照。
        q['asset_ids']=[]; q['sources']=[]; q['difficulty']=request.difficulty
        q['scope']={**request.scope.model_dump(),'knowledge_point_ids':points,'prerequisite_ids':prerequisites}
        if any(r['data']['needs_figure'] for r in selected): q['needs_figure']=True
        content=QuestionInput.model_validate(q)
        with self.repo.transaction() as db:
            self._inputs(job,db)
            version=QuestionService(self.repo).save(owner,content,db=db)
            self.repo.create('generation_sources',owner,{'question_version_id':version['id'],'reference_ids':cited,
                'chapter_versions':scope['versions'],'sources':[{'file_id':e['file_id'],'kind':e['kind'],'index':e['index']} for e in excerpts],
                'kind':unit['mode'],'job_id':job['id'],'unit_id':job['unit_id'],
                'model':getattr(self.ai.resolve(owner,'llm'),'model','test-provider')},parent_id=version['id'],db=db)
            self.jobs.complete_unit(job['id'],job['lease_token'],{'ids':[version['id']]},db=db)
        return {'ids':[version['id']]}

    def process_import(self,job):
        with self.repo.read() as db: self.jobs.assert_lease(db,job['id'],job['lease_token'])
        owner=job['owner_id']; file_id=job['unit']['file_id']; mode=job['payload'].get('mode','local')
        files=KnowledgeFiles(self.repo); extracted=files.extract(owner,file_id)
        if mode=='local':
            with self.repo.transaction() as db:
                self.jobs.complete_unit(job['id'],job['lease_token'],{'ids':[file_id]},db=db)
            return {'ids':[file_id]}
        sources=[]
        for source in extracted['sources']:
            with self.repo.read() as db:self.jobs.assert_lease(db,job['id'],job['lease_token'])
            if source.get('formulas'):
                raise KnowledgeError('Word 内含需核对的公式对象，请先转 PDF 后识别，或对照原件手动录题；未忽略公式继续生成')
            text=source.get('text','')
            if any(flag in source.get('warnings',[]) for flag in ('needs_ocr','verify_visual_math')) or not text.strip():
                pieces=[]
                for asset in source['asset_refs']:
                    image,media=files.read(owner,asset)
                    response=self.ai.recognize(owner,image,media)
                    pieces.append(str(response.get('text',''))[:15000])
                if pieces:text=text+'\n[图文识别，待教师核对]\n'+'\n'.join(pieces)
            sources.append({'file_id':file_id,'kind':'paragraph' if extracted['index_kind']=='paragraph' else 'page',
                            'index':source['index'],'text':text,'asset_refs':source['asset_refs']})
        if sum(len(s['text']) for s in sources)>40000: raise KnowledgeError('内容过多，请分章节整理')
        with self.repo.read() as db:self.jobs.assert_lease(db,job['id'],job['lease_token'])
        response=self.ai.generate(owner,{'instruction':'整理上传数学题为 questions 数组，每题字段 prompt,response_type,options,answer,explanation,rubric,needs_figure,source_indexes。忠实提取，不补猜原文件答案；缺答案保留空字典。没有题目则返回空数组。',
                                         'sources':sources})
        questions=response.get('questions')
        if not isinstance(questions,list) or not questions or len(questions)>200: raise KnowledgeError('未识别到题目或超过 200 道，请核对原文或分批处理')
        with self.repo.transaction() as db:
            self.jobs.assert_lease(db,job['id'],job['lease_token'])
            import json
            previous=sum(len(json.loads(row[0]).get('ids',[])) for row in db.execute('SELECT result FROM tk_job_units WHERE job_id=? AND result IS NOT NULL',(job['id'],)))
            if previous+len(questions)>200:
                raise KnowledgeError('本批次候选题超过 200 道，请拆分为新批次')
            ids=[]
            for q in questions:
                indexes=q.pop('source_indexes',[])
                chosen=[s for s in sources if s['index'] in indexes]
                if not chosen or len(chosen)!=len(set(indexes)): raise KnowledgeError('识别题目的来源页码无效')
                q['sources']=[{k:s[k] for k in ('file_id','kind','index')} for s in chosen]
                q['asset_ids']=list(dict.fromkeys(a for s in chosen for a in s['asset_refs'])) if q.get('needs_figure') else []
                version=QuestionService(self.repo).save(owner,QuestionInput.model_validate(q),db=db)
                ids.append(version['id'])
            self.jobs.complete_unit(job['id'],job['lease_token'],{'ids':ids},db=db)
        return {'ids':ids}
