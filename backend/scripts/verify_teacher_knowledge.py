"""在临时一致性副本上验证知识库迁移，不写入原数据库或复制密钥文件。"""
import argparse
import json
import sqlite3
import sys
import tempfile
from contextlib import closing
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.teacher_knowledge.schema import migrate_knowledge_schema
from scripts.verify_teacher_migration import fingerprints


def verify(database,output_dir):
    database=Path(database).resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix='knowledge-rehearsal-') as directory:
        copy=Path(directory)/'copy.db'
        with closing(sqlite3.connect(f'{database.as_uri()}?mode=ro',uri=True)) as source,closing(sqlite3.connect(copy)) as target:
            source.backup(target)
        with closing(sqlite3.connect(copy)) as db:
            names=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'tk_%'")]
            before=fingerprints(db,names)
            db.execute('PRAGMA foreign_keys=ON')
            db.execute('BEGIN IMMEDIATE');migrate_knowledge_schema(db);db.rollback()
            assert fingerprints(db,names)==before
            for _ in range(2):
                db.execute('BEGIN IMMEDIATE');migrate_knowledge_schema(db);db.commit()
            assert fingerprints(db,names)==before
            assert not db.execute('PRAGMA foreign_key_check').fetchall()
            assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        result={'original_unchanged':True,'original_table_count':len(names),'rollback':'passed','repeat':'passed','foreign_keys':'passed','integrity':'ok'}
    output=Path(output_dir);output.mkdir(parents=True,exist_ok=True)
    # 只输出验证统计，不写入账号、题目、密码摘要等原库内容。
    (output/'knowledge-rehearsal.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--output-dir',type=Path,required=True)
    arguments=parser.parse_args()
    print(json.dumps(verify(arguments.database,arguments.output_dir),ensure_ascii=False))
