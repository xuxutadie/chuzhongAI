"""版本 2 是完整切换标记；版本 1 的基础表不会单独改变线上权限。"""
from .schema import education_schema_ready
from .errors import EducationError


def cutover_enabled(db):
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE name='education_schema_versions'").fetchone()
    if not exists:
        return False
    enabled = db.execute('SELECT 1 FROM education_schema_versions WHERE version=2').fetchone() is not None
    if enabled and not education_schema_ready(db):
        raise EducationError('学校权限升级不完整，请联系管理员', 503)
    return enabled


def require_cutover(db):
    if not cutover_enabled(db):
        raise EducationError('学校隔离尚未完成整体切换，请联系管理员', 503)
