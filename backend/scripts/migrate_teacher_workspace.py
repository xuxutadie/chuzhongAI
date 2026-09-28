"""教师迁移工具：明确指定数据库与新备份位置，不隐式修改运行数据库。"""
import argparse
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.repositories.learning_route_repository import backup_database
from app.repositories.teacher_schema import migrate_teacher_schema


def main():
    parser = argparse.ArgumentParser(description='教师数据结构备份与迁移')
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--backup', type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    source = args.database.resolve()
    if not source.is_file():
        parser.error('数据库文件不存在')
    if args.check_only:
        db = sqlite3.connect(f'{source.as_uri()}?mode=ro', uri=True)
        try:
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('数据库完整性检查失败')
            print('完整性检查通过；未修改数据库。')
        finally:
            db.close()
        return
    if args.backup is None:
        parser.error('执行迁移必须指定尚不存在的备份文件 --backup')
    backup_database(source, args.backup.resolve())
    db = sqlite3.connect(source)
    try:
        db.execute('PRAGMA foreign_keys=OFF')
        db.execute('BEGIN IMMEDIATE')
        migrate_teacher_schema(db)
        db.commit()
    except BaseException:
        db.rollback()
        raise
    finally:
        db.execute('PRAGMA foreign_keys=ON')
        db.close()
    print(f'教师结构迁移完成；备份：{args.backup.resolve()}')


if __name__ == '__main__':
    main()
