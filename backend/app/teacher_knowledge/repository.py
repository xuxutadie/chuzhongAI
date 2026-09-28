"""短事务与强制所属人查询；表名只能来自内部白名单。"""
import json
from datetime import datetime, timezone
from uuid import uuid4
from app.repositories.teacher_repository import TeacherRepository
from .schema import TABLES
from app.education.errors import EducationError
from app.education.policy import require_context
from .access import scoped_database, require_running_job


class KnowledgeError(Exception):
    def __init__(self, message, status_code=422):
        super().__init__(message)
        self.status_code = status_code


def stamp():
    return datetime.now(timezone.utc).isoformat()


def pack(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def unpack(row):
    result = dict(row)
    if 'data' in result:
        result['data'] = json.loads(result['data'])
    return result


class KnowledgeRepository(TeacherRepository):
    def __init__(self, path, *, identity=None, context=None, job=None):
        super().__init__(path)
        self.identity, self.context, self.job = identity, context, job

    def access(self, db, owner_id):
        try:
            if not scoped_database(db):
                return None
            if self.job is not None:
                row = require_running_job(db, self.job['id'], self.job['lease_token'])
                if row['owner_id'] != owner_id:
                    raise EducationError('资料不存在或无权访问', 404)
                return row['space_id']
            if self.identity is None or self.context is None:
                raise EducationError('请先选择学校或机构', 409)
            if self.identity.user_id != owner_id:
                raise EducationError('资料不存在或无权访问', 404)
            require_context(db, self.identity, self.context)
            return self.context.space_id
        except EducationError as error:
            raise KnowledgeError(str(error), error.status_code) from None

    def scope_clause(self, db, owner_id, prefix=''):
        space_id = self.access(db, owner_id)
        return (f' AND {prefix}space_id=?', [space_id]) if space_id else ('', [])

    def fresh_access(self, owner_id):
        with self.read() as db:
            return self.access(db, owner_id)

    def ready(self):
        if not self.path.is_file():
            return False
        with self.read() as db:
            exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='tk_schema_versions'").fetchone()
            return bool(exists and db.execute('SELECT 1 FROM tk_schema_versions WHERE version=1').fetchone())

    @staticmethod
    def table(name):
        if name not in TABLES:
            raise ValueError('无效资源类型')
        return 'tk_' + name

    def owned(self, table, owner_id, object_id, *, db=None):
        name = self.table(table)
        if db is None:
            with self.read() as connection:
                item = self.owned(table, owner_id, object_id, db=connection)
            self.fresh_access(owner_id)
            return item
        clause, args = self.scope_clause(db, owner_id)
        row = db.execute(f'SELECT * FROM {name} WHERE owner_id=? AND id=?{clause}', [owner_id, object_id, *args]).fetchone()
        if row is None:
            raise KnowledgeError('资料不存在或无权访问', 404)
        return unpack(row)

    def create(self, table, owner_id, data, *, parent_id=None, object_id=None, db=None):
        if db is None:
            with self.transaction() as connection:
                return self.create(table, owner_id, data, parent_id=parent_id, object_id=object_id, db=connection)
        name = self.table(table)
        space_id = self.access(db, owner_id)
        parent_table = {'chapters':'textbooks','chapter_versions':'chapters',
                        'question_versions':'questions','generation_sources':'question_versions'}.get(table)
        if space_id and parent_table:
            if not parent_id: raise KnowledgeError('资料缺少所属资源', 422)
            self.owned(parent_table, owner_id, parent_id, db=db)
        object_id = object_id or str(uuid4())
        now = stamp()
        columns, values = ('', []) if not space_id else (',space_id', [space_id])
        db.execute(f'INSERT INTO {name}(id,owner_id,data,parent_id,created_at,updated_at{columns}) VALUES(?,?,?,?,?,?{",?" if space_id else ""})',
                   [object_id, owner_id, pack(data), parent_id, now, now, *values])
        return self.owned(table, owner_id, object_id, db=db)

    def update(self, table, owner_id, object_id, data, expected_revision, *, archived=None, db=None):
        if db is None:
            with self.transaction() as connection:
                return self.update(table, owner_id, object_id, data, expected_revision, archived=archived, db=connection)
        old = self.owned(table, owner_id, object_id, db=db)
        if old['revision'] != expected_revision:
            raise KnowledgeError('资料已更新，请重新读取后再保存',409)
        db.execute(f'UPDATE {self.table(table)} SET data=?,revision=revision+1,archived=?,updated_at=? WHERE id=? AND owner_id=?',
                   (pack(data), old['archived'] if archived is None else int(archived), stamp(), object_id, owner_id))
        if archived is not None and bool(old['archived'])!=bool(archived):
            self.create('review_events',owner_id,{'kind':'archive' if archived else 'restore','resource':table,'resource_id':object_id,'revision':expected_revision+1},db=db)
        return self.owned(table, owner_id, object_id, db=db)

    def listing(self, table, owner_id, *, offset=0, limit=20, archived=False, search='', filters=None):
        if offset < 0 or not 1 <= limit <= 100:
            raise KnowledgeError('分页参数无效')
        clauses = ['owner_id=?', 'archived=?']
        args = [owner_id, int(archived)]
        if table == 'chapter_versions':
            clauses.append("EXISTS(SELECT 1 FROM tk_chapters c JOIN tk_textbooks b ON b.id=c.parent_id AND b.owner_id=c.owner_id WHERE c.id=tk_chapter_versions.parent_id AND c.owner_id=tk_chapter_versions.owner_id AND c.archived=0 AND b.archived=0 AND json_extract(c.data,'$.current_version_id')=tk_chapter_versions.id)")
        if search:
            clauses.append('(json_extract(data,\'$.title\') LIKE ? OR json_extract(data,\'$.prompt\') LIKE ?)')
            args.extend(['%' + search[:200] + '%'] * 2)
        paths = {'grade':'$.scope.grade','edition':'$.scope.edition','difficulty':'$.difficulty',
                 'status':'$.status','response_type':'$.response_type','parent_id':None}
        if table in ('textbooks','chapters','chapter_versions'):
            paths.update(grade='$.grade',edition='$.edition')
        for key, value in (filters or {}).items():
            if key not in paths or not value:
                continue
            clauses.append('parent_id=?' if key == 'parent_id' else f"json_extract(data,'{paths[key]}')=?")
            args.append(value)
        where = ' AND '.join(clauses)
        with self.read() as db:
            extra, scope_args = self.scope_clause(db, owner_id)
            where += extra
            args.extend(scope_args)
            if scope_args and table == 'chapter_versions':
                where += ' AND EXISTS(SELECT 1 FROM tk_chapters c JOIN tk_textbooks b ON b.id=c.parent_id AND b.space_id=c.space_id WHERE c.id=tk_chapter_versions.parent_id AND c.space_id=tk_chapter_versions.space_id)'
            total = db.execute(f'SELECT count(*) FROM {self.table(table)} WHERE {where}',args).fetchone()[0]
            rows = db.execute(f'SELECT * FROM {self.table(table)} WHERE {where} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?',[*args,limit,offset])
            result = {'items':[unpack(r) for r in rows], 'total':total,'offset':offset,'limit':limit}
        self.fresh_access(owner_id)
        return result
