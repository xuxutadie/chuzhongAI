"""云端启动前只读验收：拒绝空库、未隔离旧库和缺失的加密配置。"""
import os
import sqlite3
from contextlib import closing
from pathlib import Path

from app.core.config import Settings, settings
from app.education.migration import checked
from app.education.runtime import require_cutover
from app.education.snapshots import no_links
from app.services.personal_api_vault import PersonalAPIVault
from app.teacher_knowledge.access import scoped_database


def verify_database(database: Path, persistent_root: Path) -> dict:
    database = Path(database).absolute()
    persistent_root = Path(persistent_root).absolute()
    no_links(database)
    no_links(persistent_root)
    if persistent_root.resolve() not in database.resolve().parents:
        raise ValueError('数据库必须位于已挂载的持久化目录内')
    if not database.is_file():
        raise ValueError('尚未导入数据库，拒绝创建空白生产数据库')
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        db.execute('BEGIN')
        checked(db)
        require_cutover(db)
        scoped_database(db)
        return {'integrity_ok': True, 'isolation_enabled': True}


def verify_release(configured: Settings, persistent_root: Path) -> dict:
    if configured.app_env != 'production':
        raise ValueError('云端必须使用 APP_ENV=production')
    if os.environ.get('API_VAULT_BACKEND') != 'aes_gcm':
        raise ValueError('云端必须启用 AES-GCM 密钥存储')
    database = configured.student_workspace_database_file
    vault = PersonalAPIVault(database)
    result = verify_database(database, persistent_root)
    # 已有配置必须能解密，绝不把旧 DPAPI 文件静默当成空配置。
    from app.teacher_knowledge.vault import SchoolAPIVault
    if vault.directory.exists():
        no_links(vault.directory)
        for path in vault.directory.glob('user-*.dpapi'):
            vault.load(int(path.stem.removeprefix('user-')))
    school_root = database.parent / f'.{database.name}.school-api'
    if school_root.exists():
        no_links(school_root)
        for directory in school_root.iterdir():
            no_links(directory)
            if directory.is_dir():
                school = SchoolAPIVault(database, directory.name)
                for path in directory.glob('user-*.dpapi'):
                    school.load(int(path.stem.removeprefix('user-')))
    from app.services.transition_pdf import register_chinese_font, register_number_font
    register_chinese_font()
    register_number_font()
    return result


if __name__ == '__main__':
    import sys
    try:
        verify_release(settings, Path(os.environ.get('APP_DATA_ROOT', '/data')))
    except Exception:
        # 不打印异常参数，防止配置和库内容出现在云平台日志中。
        print('部署预检失败：检查持久化挂载、数据库隔离版本、加密配置和 PDF 字体。', file=sys.stderr)
        raise SystemExit(1)
    print('部署预检通过：数据库完整、学校隔离启用、加密和 PDF 字体可用。')
