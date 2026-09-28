"""前后端共用访谈题目和分支条件，旧档案不强制重新建档。"""
import json
from pathlib import Path

QUESTIONS = json.loads((Path(__file__).resolve().parents[3] / "shared/diagnosis-interview.json").read_text(encoding="utf-8"))


def interview_for(fields):
    result = []
    for row in QUESTIONS:
        condition = row.get("when")
        if condition:
            value = str(fields.get(condition["field"], fields.get("learning_details", {}).get(condition["field"], "")))
            if not value or (condition["contains"] and not any(word in value for word in condition["contains"])):
                continue
        result.append(row)
    return result
