"""在临时副本演练迁移；输出校验结果，不输出账号秘密。"""
import argparse
import hashlib
import sqlite3
import sys
import tempfile
from pathlib import Path
from contextlib import closing
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.admin_workspace.schema import migrate_admin_schema
from scripts.migrate_admin_workspace import checked


def fingerprints(db):
    result={}
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'admin_%' AND name NOT LIKE 'sqlite_%'"):
        safe=table.replace('"','""')
        rows=db.execute(f'SELECT * FROM "{safe}"').fetchall()
        result[table]=hashlib.sha256(repr(sorted(rows,key=repr)).encode()).hexdigest()
    return result


def compare_promotion(before_path:Path,after_path:Path,target_id:int):
    """仅输出布尔结果；密码哈希与会话值只在内存中比较，不打印。"""
    with closing(sqlite3.connect(f'{before_path.resolve(strict=True).as_uri()}?mode=ro',uri=True)) as before, closing(sqlite3.connect(f'{after_path.resolve(strict=True).as_uri()}?mode=ro',uri=True)) as after:
        checked(after)
        old_tables,new_tables=fingerprints(before),fingerprints(after)
        preserved=all(new_tables.get(k)==v for k,v in old_tables.items() if k not in ('users','sessions'))
        before.row_factory=after.row_factory=sqlite3.Row
        old_users={r['id']:dict(r) for r in before.execute('SELECT * FROM users')}
        new_users={r['id']:dict(r) for r in after.execute('SELECT * FROM users')}
        expected=dict(old_users[target_id])
        if expected['role']!='admin':
            expected['role']='admin'
            expected['auth_version']+=1
        users_ok=new_users=={**old_users,target_id:expected}
        old_sessions=[tuple(r) for r in before.execute('SELECT * FROM sessions WHERE user_id<>? ORDER BY id',(target_id,))]
        new_sessions=[tuple(r) for r in after.execute('SELECT * FROM sessions WHERE user_id<>? ORDER BY id',(target_id,))]
        sessions_ok=old_sessions==new_sessions and after.execute('SELECT count(*) FROM sessions WHERE user_id=?',(target_id,)).fetchone()[0]==0
        if not (preserved and users_ok and sessions_ok):
            raise ValueError('升级数据对比不一致，请停止并核查备份')
        return {'business_data_preserved':True,'tables_checked':len(old_tables)-2,'other_accounts_preserved':True,
                'password_preserved':True,'target_sessions_revoked':True,'other_sessions_preserved':True,'integrity':'ok','foreign_key_errors':0}


def verify(database:Path,*,username=None,expected_id=None):
    with tempfile.TemporaryDirectory() as folder:
        target=Path(folder)/'verify.db'
        with closing(sqlite3.connect(f'{database.resolve(strict=True).as_uri()}?mode=ro',uri=True)) as source,closing(sqlite3.connect(target)) as db:
            source.backup(db)
            before=fingerprints(db)
            db.execute('PRAGMA foreign_keys=ON');db.execute('BEGIN IMMEDIATE')
            migrate_admin_schema(db);checked(db);db.commit()
            preserved=before==fingerprints(db)
            if not preserved: raise ValueError('业务数据变化，停止部署')
        result={'business_data_preserved':True,'tables_checked':len(before),'integrity':'ok','foreign_key_errors':0}
        if username is not None:
            from scripts.promote_admin_account import promote
            promotion=promote(target,username,expected_id,Path(folder)/'backups')
            result.update(compare_promotion(Path(promotion['backup']),target,expected_id))
            result['promotion_rehearsed']=True
        return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--username')
    parser.add_argument('--expected-id',type=int)
    args=parser.parse_args()
    print(verify(args.database,username=args.username,expected_id=args.expected_id))
