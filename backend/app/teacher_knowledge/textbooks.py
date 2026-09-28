"""教材与来源章节；审核不把上传成功当作识别正确。"""
from app.schemas.teacher_knowledge import SourceRef,ChapterInput
from .repository import KnowledgeError


def validate_mapping(data):
    from .scope import system_catalog
    chapters=[c for c in system_catalog() if all(c[k]==data[k] for k in ('grade','edition','semester'))]
    points={p['id'] for c in chapters for p in c['knowledge_points']}
    if not points or not set(data['knowledge_point_ids']).issubset(points) or not set(data['prerequisite_ids']).issubset(points):
        raise KnowledgeError('此教材年级、版本或知识点尚未有可靠映射，可保留草稿但不能用于自动出题')


def source_excerpt(repo,owner_id,source,*,db=None):
    source=SourceRef.model_validate(source).model_dump()
    file=repo.owned('files',owner_id,source['file_id'],db=db)
    if file['archived']: raise KnowledgeError('来源文件已归档')
    extraction=file['data'].get('extraction')
    if not extraction: raise KnowledgeError('来源文件尚未完成提取，请先处理文件')
    kind='paragraph' if extraction['index_kind']=='paragraph' else 'page'
    if kind!=source['kind']: raise KnowledgeError('来源位置类型不符')
    unit=next((s for s in extraction['sources'] if s['index']==source['index']),None)
    if not unit: raise KnowledgeError('来源页码或段落不存在')
    return {**source,'text':unit.get('text',''),'asset_refs':unit.get('asset_refs',[]),'formulas':unit.get('formulas',[]),'warnings':unit.get('warnings',[])}


class TextbookService:
    def __init__(self,repo): self.repo=repo

    def create(self,owner_id,metadata):
        required=['title','grade','edition','semester']
        if not all(isinstance(metadata.get(k),str) and metadata[k].strip() for k in required):
            raise KnowledgeError('请填写教材名称、年级、版本和上下册')
        if metadata.get('subject','数学')!='数学': raise KnowledgeError('当前仅开放数学')
        data={k:metadata[k].strip()[:200] for k in required}
        data.update(subject='数学',file_ids=[])
        return self.repo.create('textbooks',owner_id,data)

    def attach_file(self,owner_id,textbook_id,file_id,expected_revision):
        with self.repo.transaction() as db:
            book=self.repo.owned('textbooks',owner_id,textbook_id,db=db)
            file=self.repo.owned('files',owner_id,file_id,db=db)
            if book['archived'] or file['archived']: raise KnowledgeError('请先恢复归档资料')
            data={**book['data'],'file_ids':list(dict.fromkeys([*book['data']['file_ids'],file_id]))}
            return self.repo.update('textbooks',owner_id,textbook_id,data,expected_revision,db=db)

    def save_chapter(self,owner_id,textbook_id,payload,expected_revision):
        payload=ChapterInput.model_validate(payload).model_dump()
        with self.repo.transaction() as db:
            book=self.repo.owned('textbooks',owner_id,textbook_id,db=db)
            if book['archived']: raise KnowledgeError('教材已归档')
            sources=[SourceRef.model_validate(s).model_dump() for s in payload.get('sources',[])]
            if len(sources)>50: raise KnowledgeError('每章节来源最多 50 页或段落')
            for source in sources:
                if source['file_id'] not in book['data']['file_ids']: raise KnowledgeError('来源不属于本教材')
                source_excerpt(self.repo,owner_id,source,db=db)
            title=str(payload.get('title','')).strip()[:200]
            if not title: raise KnowledgeError('请输入章节名称')
            points=payload.get('knowledge_point_ids',[])
            prerequisites=payload.get('prerequisite_ids',[])
            if not all(isinstance(v,str) and len(v)<=100 for v in [*points,*prerequisites]): raise KnowledgeError('知识点格式无效')
            data={'title':title,'sources':sources,'knowledge_point_ids':points,'prerequisite_ids':prerequisites,
                  'textbook_id':textbook_id,'grade':book['data']['grade'],'edition':book['data']['edition'],
                  'semester':book['data']['semester'],'status':'draft','notes':str(payload.get('notes',''))[:15000]}
            chapter_id=payload.get('chapter_id')
            if chapter_id:
                old=self.repo.owned('chapters',owner_id,chapter_id,db=db)
                if old['parent_id']!=textbook_id: raise KnowledgeError('章节不属于本教材')
                self.repo.update('chapters',owner_id,chapter_id,data,expected_revision,db=db)
            else:
                chapter_id=self.repo.create('chapters',owner_id,data,parent_id=textbook_id,db=db)['id']
            data['chapter_id']=chapter_id
            version=self.repo.create('chapter_versions',owner_id,data,parent_id=chapter_id,db=db)
            current=self.repo.owned('chapters',owner_id,chapter_id,db=db)
            self.repo.update('chapters',owner_id,chapter_id,{**data,'current_version_id':version['id']},current['revision'],db=db)
            return version

    def review_chapter(self,owner_id,chapter_version_id,expected_revision):
        with self.repo.transaction() as db:
            version=self.repo.owned('chapter_versions',owner_id,chapter_version_id,db=db)
            data=version['data']
            parent=self.repo.owned('chapters',owner_id,data['chapter_id'],db=db)
            book=self.repo.owned('textbooks',owner_id,data['textbook_id'],db=db)
            if book['archived'] or parent['archived'] or parent['data']['current_version_id']!=version['id']:
                raise KnowledgeError('章节已修订或归档，请审核最新版本',409)
            if not data['sources'] or not data['knowledge_point_ids']:
                raise KnowledgeError('审核前须明确来源和知识点')
            validate_mapping(data)
            excerpts=[source_excerpt(self.repo,owner_id,source,db=db) for source in data['sources']]
            if any(e['formulas'] for e in excerpts) and not data.get('notes','').strip():
                raise KnowledgeError('Word 公式尚需核对，请在教师笔记中转写公式或改用 PDF 来源')
            if not any(e['text'].strip() for e in excerpts) and not data.get('notes','').strip():
                raise KnowledgeError('扫描章节须补充核对后的原文或教师笔记，不能仅凭空白识别内容出题')
            updated=self.repo.update('chapter_versions',owner_id,version['id'],{**data,'status':'reviewed'},expected_revision,db=db)
            self.repo.create('review_events',owner_id,{'kind':'chapter','version_id':version['id']},db=db)
            return updated

    def set_archived(self,owner_id,textbook_id,archived,expected_revision):
        item=self.repo.owned('textbooks',owner_id,textbook_id)
        return self.repo.update('textbooks',owner_id,textbook_id,item['data'],expected_revision,archived=archived)
