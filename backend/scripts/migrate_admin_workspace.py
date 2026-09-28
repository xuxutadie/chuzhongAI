"""显式管理迁移：一致性备份、事务升级与完整性检查。"""
import argparse
import sqlite3
import sys
import tempfile
from pathlib import Path
from contextlib import closing
from datetime import datetime
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.admin_workspace.schema import migrate_admin_schema


def backup_database(database:Path,backup_dir:Path):
    database=database.resolve(strict=True)
    backup_dir.mkdir(parents=True,exist_ok=True)
    backup=backup_dir/('admin-'+datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.db')
    with backup.open('xb'): pass
    with closing(sqlite3.connect(f'{database.as_uri()}?mode=ro',uri=True)) as source, closing(sqlite3.connect(backup)) as target:
        source.backup(target)
    return backup


def checked(db):
    if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('数据库校验失败，事务已停止')


def migrate(database:Path,backup_dir:Path,dry_run=False):
    backup=backup_database(database,backup_dir)
    with tempfile.TemporaryDirectory() as folder:
        target=database.resolve(strict=True)
        if dry_run:
            target=Path(folder)/'rehearsal.db'
            with closing(sqlite3.connect(backup)) as source,closing(sqlite3.connect(target)) as copy: source.backup(copy)
        with closing(sqlite3.connect(target)) as db,db:
            db.execute('PRAGMA foreign_keys=ON');db.execute('BEGIN IMMEDIATE')
            migrate_admin_schema(db);checked(db)
    return {'backup':str(backup),'dry_run':dry_run,'integrity':'ok'}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--backup-dir',type=Path,required=True)
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    print(migrate(args.database,args.backup_dir,args.dry_run))
