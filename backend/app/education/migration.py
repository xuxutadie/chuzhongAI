"""离线归属迁移：显式映射、事务回滚、原学习记录不变。"""
import hashlib
import json
from contextlib import closing
from pathlib import Path
import sqlite3
from typing import Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, ConfigDict, Field
from app.admin_workspace.schema import account_is_active, stamp
from app.teacher_knowledge.schema import TABLES, migrate_knowledge_schema, migrate_knowledge_spaces
from .schema import migrate_education_schema
from .runtime import cutover_enabled
from .service import new_invitation_token, token_digest, invitation_expiry, record_event
from .snapshots import snapshot, verify_snapshot, restore_copy


class StrictMapping(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class SpaceRow(StrictMapping):
    id: str
    name: str = Field(min_length=1,max_length=100)
    kind: Literal['school','institution','independent']


class MemberRow(StrictMapping):
    space_id: str
    user_id: int = Field(gt=0)
    role: Literal['school_admin','teacher','student']


class ResourceRow(StrictMapping):
    table: str
    id: str
    owner_id: int = Field(gt=0)
    space_id: str


class Mapping(StrictMapping):
    version: Literal[1]
    source_fingerprint: str = Field(pattern=r'^[0-9a-f]{64}$')
    admin_id: int = Field(gt=0)
    spaces: list[SpaceRow]
    members: list[MemberRow]
    resources: list[ResourceRow]


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',',':'),
                      default=lambda value: {'bytes':bytes(value).hex()}).encode('utf-8')


def map_digest(mapping):
    return hashlib.sha256(canonical(mapping)).hexdigest()


def tables(db):
    return [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]


def database_fingerprint(db, *, business_only=False):
    digest=hashlib.sha256()
    for name in tables(db):
        if name=='sessions' or (business_only and name.startswith(('education_','tk_'))): continue
        # 表名只来自 sqlite_master，双引号转义，不使用外部输入拼接标识符。
        quoted='"'+name.replace('"','""')+'"'
        columns=[row[1] for row in db.execute('PRAGMA table_info('+quoted+')')]
        rows=sorted(canonical(tuple(row)) for row in db.execute('SELECT * FROM '+quoted))
        digest.update(canonical([name,columns]))
        for row in rows: digest.update(len(row).to_bytes(8,'big')); digest.update(row)
    return digest.hexdigest()


def business_fingerprint(db):
    return database_fingerprint(db,business_only=True)


def inventory(database):
    path=Path(database).resolve(strict=True)
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row; db.execute('BEGIN')
        existing=set(tables(db)); resources=[]
        for name in TABLES:
            if 'tk_'+name not in existing: continue
            for row in db.execute('SELECT id,owner_id,data,parent_id FROM tk_'+name+' ORDER BY id'):
                data=json.loads(row['data'])
                resources.append({'table':name,'id':row['id'],'owner_id':row['owner_id'],
                                  'parent_id':row['parent_id'],'title':str(data.get('title',''))[:100]})
        return {'fingerprint':database_fingerprint(db),'enabled':cutover_enabled(db),
                'accounts':[dict(row) for row in db.execute('SELECT id,display_name,role FROM users ORDER BY id')],
                'resources':resources, 'notice':'未映射资源隔离；成员须接受邀请，学生学情须另行同意。'}


def references(table, data):
    """只跟随模型中明确的私有资源外键，不把知识点 ID 当私有资源。"""
    singular={'file_id':'files','textbook_id':'textbooks','chapter_id':'chapters',
              'question_version_id':'question_versions','revised_from':'question_versions'}
    plural={'file_ids':'files','asset_ids':'files','asset_refs':'files',
            'chapter_version_ids':'chapter_versions','question_version_ids':'question_versions',
            'reference_ids':'question_versions'}
    if table in ('chapters','questions'):
        singular['current_version_id']='chapter_versions' if table=='chapters' else 'question_versions'
    if table=='review_events':
        singular['version_id']='chapter_versions' if data.get('kind')=='chapter' else 'question_versions'
    if isinstance(data,dict):
        for key,value in data.items():
            if key in singular and value: yield singular[key],value
            elif key in plural:
                for identifier in value: yield plural[key],identifier
            elif key=='chapter_versions':
                for item in value: yield 'chapter_versions',item['id']
            elif isinstance(value,(dict,list)): yield from references(table,value)
    elif isinstance(data,list):
        for value in data: yield from references(table,value)


def apply_mapping(db, raw_mapping):
    if not db.in_transaction: raise ValueError('迁移必须处于显式写事务')
    mapping=Mapping.model_validate(raw_mapping).model_dump()
    digest=map_digest(mapping)
    if 'education_cutover_receipts' in tables(db):
        receipt=db.execute('SELECT mapping_digest FROM education_cutover_receipts').fetchone()
        if receipt and receipt[0]==digest and cutover_enabled(db):
            checked(db)
            return {'already_applied':True,'mapping_digest':digest,'invitations':[],'integrity_ok':True}
        raise ValueError('已迁移，禁止用不同映射重复切换')
    if cutover_enabled(db): raise ValueError('现有空间已启用，不能执行首次迁移')
    if database_fingerprint(db)!=mapping['source_fingerprint']: raise ValueError('盘点后数据已改变，请重新盘点并核对归属')
    admin=db.execute('SELECT role FROM users WHERE id=?',(mapping['admin_id'],)).fetchone()
    if not admin or admin[0]!='admin' or not account_is_active(db,mapping['admin_id']): raise ValueError('必须指定有效平台管理员')
    before=business_fingerprint(db)
    migrate_education_schema(db); migrate_knowledge_schema(db); migrate_knowledge_spaces(db)
    if db.execute('SELECT count(*) FROM education_spaces').fetchone()[0]:
        raise ValueError('首次迁移要求尚未开通空间，已有空间请单独审查')
    spaces={}; now=stamp()
    for space in mapping['spaces']:
        identifier=space['id']
        if str(UUID(identifier))!=identifier or identifier in spaces or not space['name'].strip(): raise ValueError('学校 ID 或名称无效／重复')
        spaces[identifier]=space
        db.execute("INSERT INTO education_spaces VALUES(?,?,?,'active',1,?,?)",(identifier,space['name'],space['kind'],now,now))
    members={}; invitations=[]
    for member in mapping['members']:
        key=(member['space_id'],member['user_id'])
        if key in members or member['space_id'] not in spaces: raise ValueError('成员映射重复或学校不存在')
        user=db.execute('SELECT role FROM users WHERE id=?',(member['user_id'],)).fetchone()
        roles=('student',) if member['role']=='student' else ('teacher','admin')
        if not user or user[0] not in roles or not account_is_active(db,member['user_id']): raise ValueError('成员账号或角色无效')
        members[key]=member
        token=new_invitation_token(); expires=invitation_expiry(); identifier=str(uuid4())
        db.execute('''INSERT INTO education_member_invitations(id,token_hash,space_id,space_revision,issuer_id,target_id,role,state,expires_at,created_at)
            VALUES(?,?,?,1,?,?,?,'pending',?,?)''',(identifier,token_digest(token),member['space_id'],mapping['admin_id'],member['user_id'],member['role'],expires,now))
        invitations.append({**member,'token':token,'expires_at':expires})
    for identifier in spaces:
        if not any(m['space_id']==identifier and m['role']=='school_admin' for m in members.values()):
            raise ValueError('每个学校必须明确邀请首位学校管理员')
    assigned={}
    for item in mapping['resources']:
        key=(item['table'],item['id'])
        member=members.get((item['space_id'],item['owner_id']))
        if item['table'] not in TABLES or key in assigned or not member or member['role']=='student': raise ValueError('资源映射或所属教师无效')
        row=db.execute('SELECT * FROM tk_'+item['table']+' WHERE id=? AND owner_id=?',(item['id'],item['owner_id'])).fetchone()
        if not row: raise ValueError('资源盘点记录不存在或所有人不符')
        assigned[key]=item
        db.execute('UPDATE tk_'+item['table']+' SET space_id=? WHERE id=?',(item['space_id'],item['id']))
    parents={'chapters':'textbooks','chapter_versions':'chapters','question_versions':'questions','generation_sources':'question_versions'}
    for (table,identifier),item in assigned.items():
        row=db.execute('SELECT data,parent_id FROM tk_'+table+' WHERE id=?',(identifier,)).fetchone()
        refs=list(references(table,json.loads(row['data'])))
        if row['parent_id'] and table in parents: refs.append((parents[table],row['parent_id']))
        for ref in refs:
            other=assigned.get(ref)
            if not other or (other['space_id'],other['owner_id'])!=(item['space_id'],item['owner_id']):
                raise ValueError('私有资源引用未映射或跨学校／教师，请一起核对归属')
    # 不给旧任务猜测学校，不继承旧认领；保留任务结果，仅取消未完成执行。
    db.execute("UPDATE tk_job_units SET state='cancelled',error='学校权限切换，请重新发起' WHERE state IN ('queued','running')")
    db.execute("UPDATE tk_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,revision=revision+1 WHERE state IN ('queued','running')")
    if business_fingerprint(db)!=before: raise ValueError('原账号或学习记录发生变化，迁移已停止')
    db.execute('DELETE FROM sessions')
    db.execute('CREATE TABLE education_cutover_receipts(mapping_digest TEXT PRIMARY KEY,source_fingerprint TEXT NOT NULL,created_at TEXT NOT NULL)')
    db.execute('INSERT INTO education_cutover_receipts VALUES(?,?,?)',(digest,mapping['source_fingerprint'],now))
    record_event(db,mapping['admin_id'],str(uuid4()),'school_isolation_cutover',digest)
    db.execute('INSERT INTO education_schema_versions VALUES(2)')
    checked(db)
    return {'already_applied':False,'mapping_digest':digest,'invitations':invitations,'integrity_ok':True}


def checked(db):
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('数据库完整性检查失败')


def migrate_copy(database, mapping, receipt_path):
    with closing(sqlite3.connect(database)) as db:
        db.row_factory=sqlite3.Row; db.execute('PRAGMA foreign_keys=ON'); db.execute('BEGIN IMMEDIATE')
        try:
            result=apply_mapping(db,mapping)
            # 邀请码仅写本地私有交付文件；不输出到控制台或一般日志。
            with Path(receipt_path).open('x',encoding='utf-8') as file: json.dump(result,file,ensure_ascii=False,indent=2)
            db.commit()
        except BaseException: db.rollback(); raise
    return {key:value for key,value in result.items() if key!='invitations'}


def rehearse(backup, destination, mapping):
    database=restore_copy(backup,destination)
    return migrate_copy(database,mapping,Path(destination)/'private-invitations.json')
