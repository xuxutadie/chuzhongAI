"""独立的入学诊断记录。事务与版本号防止多标签页覆盖；交卷后答案不可改。"""
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.services.transition_bank import VERSION, build_paper, grade_paper, public_paper
from app.services.transition_diagrams import corrected_question_display


class ConflictError(Exception):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False)


class DiagnosisService:
    def __init__(self, database_path, collector=None):
        self.collector = collector
        self.path = Path(database_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS diagnosis_profiles (
                    user_id INTEGER PRIMARY KEY, fields_json TEXT NOT NULL,
                    confirmed INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS diagnosis_attempts (
                    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                    profile_json TEXT NOT NULL, paper_json TEXT NOT NULL,
                    answers_json TEXT NOT NULL DEFAULT '{}', times_json TEXT NOT NULL DEFAULT '{}',
                    report_json TEXT, revision INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'submitted')),
                    created_at TEXT NOT NULL, submitted_at TEXT, version TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS diagnosis_user_idx ON diagnosis_attempts(user_id, created_at);
                CREATE UNIQUE INDEX IF NOT EXISTS diagnosis_one_active ON diagnosis_attempts(user_id) WHERE status = 'active';
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def profile(self, user_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM diagnosis_profiles WHERE user_id=?", (user_id,)).fetchone()
        return {"fields": json.loads(row["fields_json"]), "confirmed": bool(row["confirmed"]),
                "revision": row["revision"]} if row else {"fields": {}, "confirmed": False, "revision": 0}

    def state(self, user_id):
        profile = self.profile(user_id)
        with self.connection() as db:
            rows = db.execute("SELECT id,status,created_at,submitted_at FROM diagnosis_attempts WHERE user_id=? ORDER BY created_at DESC", (user_id,)).fetchall()
        return {"profile": profile, "attempt": self.get_attempt(user_id, rows[0]["id"]) if rows else None,
                "history": [dict(row) for row in rows],
                "supported": profile["fields"].get("grade") in ("六年级", "升七年级", "七年级")}

    def save_profile(self, user_id, revision, fields, confirmed):
        if confirmed and not all(fields.get(k, "").strip() for k in ("nickname", "grade", "textbook")):
            raise ValueError("请先填写称呼、年级和教材（不确定可填写不确定）。")
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM diagnosis_profiles WHERE user_id=?", (user_id,)).fetchone()
            if (row["revision"] if row else 0) != revision:
                raise ConflictError("档案已在其他页面更新，请重新载入后继续。")
            if row and row["confirmed"] and not confirmed:
                raise ConflictError("已确认的档案不能退回草稿，请在档案页直接保存修改。")
            fields = dict(fields)
            previous = json.loads(row["fields_json"]) if row else {}
            # 旧客户端未传新增字段时保留原值；显式清空仍视为用户修改。
            for key in ("school_name", "class_name"):
                if key not in fields:
                    fields[key] = previous.get(key, "")
            if confirmed and not (row and row["confirmed"]) and not all(fields[k].strip() for k in ("school_name", "class_name")):
                raise ValueError("请填写学校和班级；暂未入学或待分班可以如实填写。")
            db.execute("""INSERT INTO diagnosis_profiles VALUES (?,?,?,?,?)
                       ON CONFLICT(user_id) DO UPDATE SET fields_json=excluded.fields_json,
                       confirmed=excluded.confirmed,revision=excluded.revision,updated_at=excluded.updated_at""",
                       (user_id, encode(fields), int(confirmed), revision + 1, now()))
        return self.profile(user_id)

    def update_school(self, user_id, revision, school_name, class_name):
        from app.schemas.transition_diagnosis import SchoolSave
        payload = SchoolSave(revision=revision, school_name=school_name, class_name=class_name)
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM diagnosis_profiles WHERE user_id=?", (user_id,)).fetchone()
            if row is None:
                raise ValueError("请先完成学习档案访谈。")
            if row["revision"] != revision:
                raise ConflictError("档案已在其他页面更新，请重新载入后继续。")
            fields = json.loads(row["fields_json"])
            fields.update(school_name=payload.school_name, class_name=payload.class_name)
            db.execute("UPDATE diagnosis_profiles SET fields_json=?,revision=revision+1,updated_at=? WHERE user_id=?",
                       (encode(fields), now(), user_id))
        return self.profile(user_id)

    def start(self, user_id, retest=False):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM diagnosis_profiles WHERE user_id=?", (user_id,)).fetchone()
            if not row or not row["confirmed"]:
                raise ConflictError("请先确认学习档案。")
            fields = json.loads(row["fields_json"])
            if fields.get("grade") not in ("六年级", "升七年级", "七年级"):
                raise ValueError("本卷适用于六年级至七年级，不作为其他年级的入学诊断。")
            existing = db.execute("SELECT id,status FROM diagnosis_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT 1", (user_id,)).fetchone()
            if existing and (existing["status"] == "active" or not retest):
                attempt_id = existing["id"]
            else:
                attempt_id = str(uuid4())
                db.execute("""INSERT INTO diagnosis_attempts(id,user_id,profile_json,paper_json,created_at,version)
                           VALUES (?,?,?,?,?,?)""", (attempt_id, user_id, encode(fields), encode(build_paper(fields, attempt_id)), now(), VERSION))
        return self.get_attempt(user_id, attempt_id)

    @staticmethod
    def owned_row(db, user_id, attempt_id):
        row = db.execute("SELECT * FROM diagnosis_attempts WHERE id=? AND user_id=?", (attempt_id, user_id)).fetchone()
        if row is None:
            raise KeyError("未找到你的测评记录。")
        return row

    def get_attempt(self, user_id, attempt_id):
        with self.connection() as db:
            row = self.owned_row(db, user_id, attempt_id)
        report = json.loads(row["report_json"]) if row["report_json"] else None
        if report:
            report["evidence"] = [corrected_question_display(q) for q in report["evidence"]]
        return {"id": row["id"], "status": row["status"], "revision": row["revision"],
                "profile": json.loads(row["profile_json"]), "paper": public_paper(json.loads(row["paper_json"])),
                "answers": json.loads(row["answers_json"]), "times": json.loads(row["times_json"]),
                "report": report,
                "created_at": row["created_at"], "submitted_at": row["submitted_at"], "version": row["version"]}

    def save_answers(self, user_id, attempt_id, revision, answers, times):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self.owned_row(db, user_id, attempt_id)
            if row["status"] != "active" or row["revision"] != revision:
                raise ConflictError("测评已更新或已交卷，请重新载入，不会覆盖原有答案。")
            paper = json.loads(row["paper_json"])
            allowed = {q["id"]: q["options"] for q in paper}
            if any(k not in allowed or (v is not None and v not in allowed[k]) for k, v in answers.items()):
                raise ValueError("答案不属于当前试卷。")
            if any(k not in allowed or not isinstance(v, int) or not 0 <= v <= 86400 for k, v in times.items()):
                raise ValueError("答题时长无效。")
            db.execute("UPDATE diagnosis_attempts SET answers_json=?,times_json=?,revision=revision+1 WHERE id=?",
                       (encode(answers), encode(times), attempt_id))
        return self.get_attempt(user_id, attempt_id)

    def submit(self, user_id, attempt_id, revision):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self.owned_row(db, user_id, attempt_id)
            if row["status"] == "active":
                if row["revision"] != revision:
                    raise ConflictError("答案在其他页面发生变化，请重新载入确认后交卷。")
                report = grade_paper(json.loads(row["paper_json"]), json.loads(row["answers_json"]))
                report["version"] = row["version"]
                db.execute("UPDATE diagnosis_attempts SET status='submitted',report_json=?,submitted_at=?,revision=revision+1 WHERE id=?",
                           (encode(report), now(), attempt_id))
            if self.collector is not None:
                self.collector.collect_submitted_attempt(db, user_id=user_id, attempt_id=attempt_id)
        return self.get_attempt(user_id, attempt_id)

    def save_interpretation(self, user_id, attempt_id, text):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = self.owned_row(db, user_id, attempt_id)
            if row["status"] != "submitted":
                raise ConflictError("交卷后才能生成报告解读。")
            report = json.loads(row["report_json"])
            # 并行请求只保留第一份 AI 解读；它不能修改任何答题证据或数值。
            if not report.get("interpretation"):
                report.update(interpretation=text, interpretation_mode="ai")
                db.execute("UPDATE diagnosis_attempts SET report_json=? WHERE id=?", (encode(report), attempt_id))
        return self.get_attempt(user_id, attempt_id)
