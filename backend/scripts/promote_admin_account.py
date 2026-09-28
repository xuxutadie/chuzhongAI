"""仅人工显式运行的账号升级，不在应用启动时执行。"""
import argparse
import sqlite3
import sys
import tempfile
from pathlib import Path
from contextlib import closing
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.migrate_admin_workspace import backup_database,checked
from app.admin_workspace.schema import admin_schema_ready,stamp
from app.admin_workspace.accounts import record_event


def promote(database:Path,username:str,expected_id:int,backup_dir:Path,dry_run=False):
    database=database.resolve(strict=True)
    with closing(sqlite3.connect(f'{database.as_uri()}?mode=ro',uri=True)) as db:
        row=db.execute('SELECT id FROM users WHERE username=?',(username,)).fetchone()
        if row is None or row[0]!=expected_id: raise ValueError('账号与预期编号不一致，未修改')
        if not admin_schema_ready(db): raise ValueError('请先完成管理模块迁移')
    backup=backup_database(database,backup_dir)
    with tempfile.TemporaryDirectory() as folder:
        target=database
        if dry_run:
            target=Path(folder)/'promotion.db'
            with closing(sqlite3.connect(backup)) as source,closing(sqlite3.connect(target)) as copy: source.backup(copy)
        with closing(sqlite3.connect(target)) as db,db:
            db.execute('PRAGMA foreign_keys=ON');db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT id,role,password_hash FROM users WHERE username=?',(username,)).fetchone()
            if row is None or row[0]!=expected_id: raise ValueError('账号已变化，已停止')
            state=db.execute('SELECT state FROM admin_account_states WHERE user_id=?',(expected_id,)).fetchone()
            if state is None or state[0]!='active': raise ValueError('目标不是正常账号，请先核对状态')
            if row[1]!='admin':
                db.execute("UPDATE users SET role='admin',auth_version=auth_version+1 WHERE id=?",(expected_id,))
                db.execute('DELETE FROM sessions WHERE user_id=?',(expected_id,))
                db.execute('UPDATE admin_account_states SET revision=revision+1,updated_at=? WHERE user_id=?',(stamp(),expected_id))
                record_event(db,None,expected_id,'promote-admin',str(uuid4()),{'source':'local-maintenance','role_before':row[1],'role_after':'admin'})
            if db.execute('SELECT password_hash FROM users WHERE id=?',(expected_id,)).fetchone()[0]!=row[2]:
                raise ValueError('密码校验不一致，已停止')
            checked(db)
    return {'backup':str(backup),'user_id':expected_id,'role':'admin','password_preserved':True,'dry_run':dry_run}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--backup-dir',type=Path,required=True)
    parser.add_argument('--username',required=True)
    parser.add_argument('--expected-id',type=int,required=True)
    parser.add_argument('--dry-run',action='store_true')
    args=parser.parse_args()
    print(promote(args.database,args.username,args.expected_id,args.backup_dir,args.dry_run))
