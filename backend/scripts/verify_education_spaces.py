"""只读验证已切换数据库或不可变备份，不自动修复或覆盖数据。"""
import argparse
import json
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.education.migration import checked, verify_snapshot
from app.education.runtime import require_cutover
from app.teacher_knowledge.access import scoped_database


def verify(database):
    path=Path(database).resolve(strict=True)
    with closing(sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row; db.execute('BEGIN')
        checked(db); require_cutover(db); scoped_database(db)
        return {'integrity_ok':True,'isolation_enabled':True,
                'spaces':db.execute('SELECT count(*) FROM education_spaces').fetchone()[0],
                'active_grants':db.execute("SELECT count(*) FROM education_student_grants WHERE state='active'").fetchone()[0]}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--database',type=Path); group.add_argument('--backup-dir',type=Path)
    args=parser.parse_args()
    print(json.dumps(verify_snapshot(args.backup_dir) if args.backup_dir else verify(args.database),ensure_ascii=False))
