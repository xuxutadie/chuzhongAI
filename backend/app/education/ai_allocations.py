"""平台统一 AI 服务仅向管理员明确指定的空间开放。"""
from pydantic import Field, StrictBool
from app.admin_workspace.schema import stamp
from .models import Request, validated
from .policy import require_platform_admin
from .service import check_request, record_event
from .errors import EducationError


class AllocationChange(Request):
    enabled: StrictBool
    expected_revision: int = Field(ge=0, strict=True)


class SchoolAIAllocations:
    def __init__(self, repo, identity):
        self.repo, self.identity = repo, identity

    def _check(self, db, space_id):
        require_platform_admin(db, self.identity)
        if not db.execute("SELECT 1 FROM sqlite_master WHERE name='education_ai_allocations'").fetchone():
            raise EducationError('学校 AI 服务尚未完成升级', 503)
        if not db.execute('SELECT 1 FROM education_spaces WHERE id=?',(space_id,)).fetchone():
            raise EducationError('学校不存在',404)

    def list(self, space_id):
        with self.repo.read() as db:
            self._check(db, space_id)
            return [dict(row) for row in db.execute('SELECT capability,enabled,revision FROM education_ai_allocations WHERE space_id=?',(space_id,))]

    def set(self, space_id, capability, payload):
        data = validated(AllocationChange,payload)
        if capability not in ('llm','ocr'): raise EducationError('不支持的模型能力',422)
        with self.repo.transaction() as db:
            self._check(db, space_id)
            check_request(db,self.identity.user_id,data['request_id'])
            old = db.execute('SELECT revision FROM education_ai_allocations WHERE space_id=? AND capability=?',(space_id,capability)).fetchone()
            revision = old['revision'] if old else 0
            if revision != data['expected_revision']: raise EducationError('配置已更新，请刷新后重试',409)
            db.execute('''INSERT INTO education_ai_allocations(space_id,capability,enabled,revision,updated_at) VALUES(?,?,?,?,?)
                ON CONFLICT(space_id,capability) DO UPDATE SET enabled=excluded.enabled,revision=excluded.revision,updated_at=excluded.updated_at''',
                (space_id,capability,int(data['enabled']),revision+1,stamp()))
            record_event(db,self.identity.user_id,data['request_id'],'school_ai_allocated',space_id+':'+capability)
        return {'capability':capability,'enabled':data['enabled'],'revision':revision+1}
