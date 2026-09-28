"""只在一致性副本演练教师迁移；正式库只读，不输出用户内容。"""
import argparse
import hashlib
import sqlite3
import sys
import tempfile
from pathlib import Path
from contextlib import closing

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.repositories.learning_route_repository import backup_database
from app.repositories.teacher_schema import migrate_teacher_schema


def fingerprints(db, tables):
    result = {}
    for name in tables:
        quoted = '"' + name.replace('"','""') + '"'
        # 字段内容按名称对齐；ALTER补列历史可能造成同一列集合的物理顺序不同。
        columns = sorted(row[1] for row in db.execute(f'PRAGMA table_info({quoted})'))
        selection = ','.join('"'+column.replace('"','""')+'"' for column in columns)
        rows = sorted(repr(tuple(row)) for row in db.execute(f'SELECT {selection} FROM {quoted}'))
        result[name] = (len(rows),hashlib.sha256(repr(rows).encode()).hexdigest())
    return result


def verify(source):
    with tempfile.TemporaryDirectory(prefix='teacher-migration-check-') as directory:
        copy = Path(directory)/'copy.db'
        restored = Path(directory)/'restored.db'
        backup_database(source,copy)
        backup_database(copy,restored)
        with closing(sqlite3.connect(copy)) as db:
            names = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            before = fingerprints(db,names)
            columns = {name: [r[1] for r in db.execute('PRAGMA table_info("'+name.replace('"','""')+'")')] for name in names}
            # 完整执行再回滚，验证不是只有空库可回滚。
            db.execute('BEGIN IMMEDIATE')
            migrate_teacher_schema(db)
            db.rollback()
            assert fingerprints(db,names) == before
            db.execute('BEGIN IMMEDIATE')
            migrate_teacher_schema(db)
            db.commit()
            after = fingerprints(db,names)
            for name in names:
                if after[name] != before[name]:
                    print({'changed_table': name, 'columns_before': columns[name], 'columns_after': [r[1] for r in db.execute('PRAGMA table_info("'+name.replace('"','""')+'")')]})
            assert after == before
            db.execute('BEGIN IMMEDIATE')
            migrate_teacher_schema(db)
            db.commit()
            assert fingerprints(db,names) == before
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        with closing(sqlite3.connect(restored)) as db:
            assert fingerprints(db,names) == before
        print({'original_tables_unchanged':len(names),'rollback':'passed','repeat':'passed','backup_restore':'passed','integrity':'ok'})


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    verify(parser.parse_args().database.resolve())
