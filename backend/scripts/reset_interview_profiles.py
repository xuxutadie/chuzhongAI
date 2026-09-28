"""离线维护工具：仅在明确确认账号后调用，不提供公开重置接口。"""
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


def reset_profiles(database_path, targets: dict[int, str], backup_path):
    database = Path(database_path).resolve(strict=True)
    backup = Path(backup_path).resolve()
    if not targets or backup == database:
        raise ValueError("必须指定学生与独立备份文件。")
    if backup.exists():
        raise FileExistsError("不覆盖已有备份。")
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("BEGIN IMMEDIATE")
        rows = []
        for user_id, expected_name in targets.items():
            user = db.execute("SELECT display_name,role FROM users WHERE id=?", (user_id,)).fetchone()
            profile = db.execute("SELECT user_id,fields_json,confirmed,revision,updated_at FROM diagnosis_profiles WHERE user_id=?", (user_id,)).fetchone()
            if user != (expected_name, "student") or profile is None:
                raise ValueError(f"学生编号 {user_id} 的身份或访谈记录与预期不符，未执行重置。")
            rows.append(profile)
        # 备份只包含这几份访谈，不复制密码、密钥或其他学生资料。
        with backup.open("xb"):
            pass
        with closing(sqlite3.connect(backup)) as archive, archive:
            archive.execute("CREATE TABLE diagnosis_profiles(user_id INTEGER PRIMARY KEY,fields_json TEXT,confirmed INTEGER,revision INTEGER,updated_at TEXT)")
            archive.executemany("INSERT INTO diagnosis_profiles VALUES(?,?,?,?,?)", rows)
        for row in rows:
            db.execute("UPDATE diagnosis_profiles SET fields_json='{}',confirmed=0,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?",
                       (datetime.now(timezone.utc).isoformat(), row[0], row[3]))
    return {"reset_user_ids": list(targets), "backup": str(backup)}
