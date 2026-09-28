"""私有原件存储和有硬超时的文档提取。"""
import hashlib
import json
import multiprocessing
import sqlite3
import re
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4
from app.teacher_assessment.extractors import extract_document, DocumentLimits, DocumentError, DOCX
from .repository import KnowledgeError

TYPES = {'.pdf':'application/pdf','.docx':DOCX,'.png':'image/png',
         '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}


def _extract_child(pipe, data, media_type):
    try:
        result=extract_document(data,media_type,DocumentLimits())
        pipe.send((True,asdict(result)))
    except DocumentError as error:
        pipe.send((False,str(error)))
    except BaseException:
        pipe.send((False,'文档处理失败，请重新导出或按章节拆分'))
    finally:
        pipe.close()


def bounded_extract(data,media_type):
    # 使用独立进程：原生 PDF 解码器卡住时也能终止，不能只在线程外等超时。
    context=multiprocessing.get_context('spawn')
    reader,writer=context.Pipe(duplex=False)
    process=context.Process(target=_extract_child,args=(writer,data,media_type),daemon=True)
    process.start(); writer.close()
    try:
        if not reader.poll(65):
            raise KnowledgeError('解析超时，请按章节拆分后重试')
        try:
            success,result=reader.recv()
        except EOFError:
            raise KnowledgeError('文档解析进程异常，请重新导出文件') from None
        if not success:
            raise KnowledgeError(result)
        return result
    finally:
        reader.close()
        process.join(timeout=1)
        if process.is_alive():
            process.terminate(); process.join(timeout=3)


class KnowledgeFiles:
    def __init__(self,repository,storage_root=None):
        self.repo=repository
        self.root=Path(storage_root) if storage_root else repository.path.parent / ('.'+repository.path.name+'.knowledge')

    def _path(self,identifier):
        if not identifier or any(c not in '0123456789abcdef-' for c in identifier):
            raise KnowledgeError('文件标识无效',404)
        path=self.root / identifier
        for candidate in [self.root,path]:
            if candidate.is_symlink() or candidate.is_junction():
                raise KnowledgeError('文件存储位置不可用',503)
        return path

    def store(self,owner_id,filename,content,*,internal=False):
        if not filename or len(filename)>200 or any(c in filename for c in '/\\\x00:'):
            raise KnowledgeError('文件名无效')
        suffix=Path(filename).suffix.lower()
        media=TYPES.get(suffix)
        if media is None:
            raise KnowledgeError('支持 PDF、DOCX、PNG、JPEG、WebP；旧 DOC 请先转存')
        maximum=(5 if media.startswith('image/') else 20)*1024*1024
        if not content or len(content)>maximum:
            raise KnowledgeError('文件为空或超过限制：文档 20 MB，图片 5 MB')
        signatures={'.pdf':b'%PDF-', '.docx':b'PK', '.png':b'\x89PNG', '.jpg':b'\xff\xd8', '.jpeg':b'\xff\xd8', '.webp':b'RIFF'}
        if not content.startswith(signatures[suffix]):
            raise KnowledgeError('文件内容与扩展名不符')
        digest=hashlib.sha256(content).hexdigest()
        with self.repo.transaction() as db:
            clause,args=self.repo.scope_clause(db,owner_id)
            row=db.execute("SELECT id FROM tk_files WHERE owner_id=? AND json_extract(data,'$.sha256')=?"+clause,[owner_id,digest,*args]).fetchone()
            if row:
                existing=self.repo.owned('files',owner_id,row['id'],db=db)
                # 清洗结果恰好与原 PNG 相同，也要登记为可安全预览的配图。
                if internal and not existing['data'].get('asset'):
                    return self.repo.update('files',owner_id,existing['id'],{**existing['data'],'asset':True},existing['revision'],db=db)
                return existing
            identifier=str(uuid4())
            path=self._path(identifier)
            self.root.mkdir(parents=True,exist_ok=True)
            try:
                with path.open('xb') as stream:
                    stream.write(content)
                return self.repo.create('files',owner_id,{'title':filename,'sha256':digest,'media_type':media,
                    'size':len(content),'asset':internal,'extraction':None},object_id=identifier,db=db)
            except BaseException:
                if path.exists(): path.unlink()
                raise

    def read(self,owner_id,file_id):
        item=self.repo.owned('files',owner_id,file_id)
        try:
            content=self._path(item['id']).read_bytes()
        except OSError:
            raise KnowledgeError('原文件不可用，请重新上传',404) from None
        self.repo.fresh_access(owner_id)
        return content,item['data']['media_type']

    def extract(self,owner_id,file_id):
        item=self.repo.owned('files',owner_id,file_id)
        if item['data'].get('extraction') is not None:
            return item['data']['extraction']
        content,media=self.read(owner_id,file_id)
        result=bounded_extract(content,media)
        mapping={}
        for digest,asset in result.pop('assets').items():
            # 提取后 PNG 仍受单张图片限额约束；原件不会因此变成公开图片。
            stored=self.store(owner_id,digest+'.png',asset['data'],internal=True)
            mapping[digest]=stored['id']
        for source in result['sources']:
            source['asset_refs']=[mapping[ref] for ref in source['asset_refs']]
        # 只提供原文中可定位的标题候选，不把目录猜测自动变成审核范围。
        result['chapter_suggestions']=[{'title':line.strip()[:200],'index':source['index']}
            for source in result['sources'] for line in source.get('text','').splitlines()
            if re.match(r'^\s*第[一二三四五六七八九十百\d]+[章节]',line)][:50]
        with self.repo.transaction() as db:
            current=self.repo.owned('files',owner_id,file_id,db=db)
            data={**current['data'],'extraction':result}
            self.repo.update('files',owner_id,file_id,data,current['revision'],db=db)
        return result

    def set_archived(self,owner_id,file_id,archived,expected_revision):
        item=self.repo.owned('files',owner_id,file_id)
        return self.repo.update('files',owner_id,file_id,item['data'],expected_revision,archived=archived)
