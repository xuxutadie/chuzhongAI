"""只读导出指定历史测评；不重算成绩、不覆盖数据库或已有 PDF。"""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.transition_pdf import render_report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("database", type=Path)
    parser.add_argument("attempt_id")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise ValueError("目标文件已经存在，请使用新文件名，保留原件。")
    with closing(sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        db.row_factory = sqlite3.Row
        row = db.execute("SELECT profile_json,report_json,version,submitted_at FROM diagnosis_attempts WHERE id=? AND status='submitted'",
                         (args.attempt_id,)).fetchone()
    if row is None:
        raise ValueError("没有找到已提交的对应测评，不生成替代数据。")
    report = json.loads(row["report_json"])
    content = render_report({"profile": json.loads(row["profile_json"]), "report": report,
                             "version": row["version"], "submitted_at": row["submitted_at"]})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("xb") as target:
        target.write(content)
    print(json.dumps({"output": str(args.output), "score": report["score"], "distribution": report["distribution"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
