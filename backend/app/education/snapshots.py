"""离线快照及只恢复到新目录的校验工具，不覆盖正在使用的数据库。"""
import hashlib
import json
import shutil
import sqlite3
from contextlib import closing
from pathlib import Path


def no_links(path):
    for part in (path,*path.parents):
        if part.is_symlink() or part.is_junction(): raise ValueError('备份路径不能包含链接或目录联接')


def file_hash(path):
    digest=hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda:file.read(1024*1024),b''): digest.update(block)
    return digest.hexdigest()


def tree_hash(root):
    result={}
    for path in root.rglob('*'):
        no_links(path)
        if path.is_file(): result[path.relative_to(root).as_posix()]=file_hash(path)
    return result


def snapshot(database, destination, *, maintenance_confirmed=False):
    if not maintenance_confirmed: raise ValueError('请先停机：停止前后端、任务工作器及所有写入，再确认备份')
    database=Path(database).absolute(); destination=Path(destination).absolute()
    no_links(database); no_links(destination)
    database=database.resolve(strict=True)
    roots=[database.parent/('.'+database.name+suffix) for suffix in ('.knowledge','.personal-api','.school-api')]
    for root in roots:
        no_links(root)
        if destination==root or root in destination.parents: raise ValueError('备份不能位于原私有资料目录内')
    destination.mkdir(parents=True,exist_ok=False)
    # 保持写锁到附件复制完成；同时要求操作员已停机，避免非数据库文件写入者。
    with closing(sqlite3.connect(database.as_uri()+'?mode=rw',uri=True,timeout=2)) as guard:
        guard.execute('BEGIN IMMEDIATE')
        try:
            before={root.name:tree_hash(root) for root in roots if root.exists()}
            with closing(sqlite3.connect(database.as_uri()+'?mode=ro',uri=True)) as source, closing(sqlite3.connect(destination/database.name)) as target:
                source.backup(target)
            for root in roots:
                if root.exists(): shutil.copytree(root,destination/root.name,symlinks=False)
            after={root.name:tree_hash(root) for root in roots if root.exists()}
            if before!=after: raise ValueError('备份期间附件或凭证仍在变化，请停机后重试')
            copied=tree_hash(destination)
            for name,files in before.items():
                for relative,digest in files.items():
                    if copied.get(name+'/'+relative)!=digest: raise ValueError('备份附件校验失败')
            manifest={'version':1,'database':database.name,'files':copied}
            with (destination/'manifest.json').open('x',encoding='utf-8') as file: json.dump(manifest,file,ensure_ascii=False,indent=2)
        finally: guard.rollback()
    verify_snapshot(destination)
    return destination


def verify_snapshot(folder):
    folder=Path(folder).absolute(); no_links(folder)
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('version')!=1 or Path(manifest['database']).name!=manifest['database']: raise ValueError('备份清单无效')
    actual=tree_hash(folder); actual.pop('manifest.json',None)
    if actual!=manifest['files'] or manifest['database'] not in actual: raise ValueError('备份文件缺失或摘要不符')
    # 已关闭的快照是不可变副本，校验不得生成 WAL/SHM 而改变备份集合。
    with closing(sqlite3.connect((folder/manifest['database']).as_uri()+'?mode=ro&immutable=1',uri=True)) as db:
        if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall(): raise ValueError('备份数据库完整性失败')
    return {'verified':True,'database':manifest['database'],'file_count':len(actual)}


def restore_copy(backup, destination):
    verified=verify_snapshot(backup)
    destination=Path(destination).absolute(); no_links(destination)
    shutil.copytree(backup,destination)  # 目标存在即拒绝，禁止自动覆盖恢复。
    return destination/verified['database']
