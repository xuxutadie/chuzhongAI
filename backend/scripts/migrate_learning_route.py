"""显式预检或迁移每日路线；不补收历史、不调用 AI。"""
import argparse
import hashlib
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.repositories.learning_route_repository import LearningRouteRepository, backup_database, migrate_learning_schema


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--backup', type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check-only', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder)/'rehearsal.db' if args.check_only else args.backup
        if target is None:
            parser.error('--apply 必须提供独立的 --backup 备份路径')
        backup_database(args.database, target)
        path = target if args.check_only else args.database.resolve()
        repository = LearningRouteRepository(path)
        with repository.transaction() as db:
            # 逐表比对旧内容，包含图片字节和原测评/报告；只输出验证结果，不打印数据。
            old_tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            def fingerprint(name):
                quoted='"'+name.replace('"','""')+'"'
                return hashlib.sha256(repr(sorted(repr(tuple(r)) for r in db.execute(f'SELECT * FROM {quoted}'))).encode()).hexdigest()
            before={name:fingerprint(name) for name in old_tables}
            old_count = db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0]
            migrate_learning_schema(db)
            assert before=={name:fingerprint(name) for name in old_tables}, '原有表内容发生变化，迁移已回滚'
            assert old_count == db.execute('SELECT COUNT(*) FROM wrong_questions').fetchone()[0]
            assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        print({'mode':'check-only' if args.check_only else 'apply', 'existing_wrong_questions':old_count, 'original_tables_unchanged':len(old_tables), 'integrity':'ok'})


if __name__ == '__main__':
    main()
