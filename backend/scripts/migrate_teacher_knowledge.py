"""知识库显式升级；先一致性备份，再在独立事务内迁移。"""
import argparse
import sqlite3
import sys
import tempfile
from contextlib import closing
from datetime import datetime
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.teacher_knowledge.schema import migrate_knowledge_schema


def migrate(database: Path, backup_dir: Path, dry_run=False):
    database = database.resolve(strict=True)
    backup_dir.mkdir(parents=True,exist_ok=True)
    backup = backup_dir / ('knowledge-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.db')
    with backup.open('xb'):
        pass  # 备份路径必须新建，禁止覆盖任何已有备份。
    # backup API 保持 WAL 数据一致，不直接复制活动数据库文件。
    # https://docs.python.org/3/library/sqlite3.html#sqlite3.Connection.backup
    with closing(sqlite3.connect(f'{database.as_uri()}?mode=ro',uri=True)) as source:
        with closing(sqlite3.connect(backup)) as target:
            source.backup(target)
    with tempfile.TemporaryDirectory() as temporary:
        target_path = database
        if dry_run:
            target_path = Path(temporary) / 'rehearsal.db'
            with closing(sqlite3.connect(backup)) as source, closing(sqlite3.connect(target_path)) as target:
                source.backup(target)
        with closing(sqlite3.connect(target_path)) as db:
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE')
            try:
                migrate_knowledge_schema(db)
                if db.execute('PRAGMA foreign_key_check').fetchall():
                    raise ValueError('外键检查失败，已回滚')
                if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise ValueError('完整性检查失败，已回滚')
                db.commit()
            except BaseException:
                db.rollback()
                raise
    return backup


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--backup-dir',type=Path,required=True)
    parser.add_argument('--dry-run',action='store_true')
    args = parser.parse_args()
    saved = migrate(args.database,args.backup_dir,args.dry_run)
    print(('副本演练通过' if args.dry_run else '迁移完成') + '；备份：' + str(saved))
