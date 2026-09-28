"""语文、英语共享单元题库。目录与答案必须同时可用，缺项时启动失败。"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

CURRICULUM_ROOT = Path(__file__).resolve().parents[3] / "shared" / "curriculum" / "language"
LANGUAGE_BOOK_SPECS = (
    ("english-7-upper", "英语", 7, 10),
    ("english-7-lower", "英语", 7, 8),
    ("chinese-7-upper", "语文", 7, 6),
    ("chinese-7-lower", "语文", 7, 6),
)
BOOK_IDS = tuple(spec[0] for spec in LANGUAGE_BOOK_SPECS)
LANGUAGE_BOOKS = tuple(json.loads((CURRICULUM_ROOT / f"{name}.json").read_text(encoding="utf-8")) for name in BOOK_IDS)


def build_language_curriculum_indexes(
    books: Sequence[dict[str, Any]],
) -> tuple[dict[str, tuple[dict[str, Any], dict[str, Any]]], dict[str, tuple[dict[str, Any], dict[str, Any]]]]:
    """校验教材身份与题库完整性，并建立单元、任务索引。"""

    if len(books) != len(LANGUAGE_BOOK_SPECS):
        raise ValueError("语文英语教材登记数量不完整")
    language_units: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    language_tasks: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    question_ids: set[str] = set()
    for book, (expected_id, expected_subject, expected_grade, expected_count) in zip(
        books, LANGUAGE_BOOK_SPECS, strict=True
    ):
        if (
            book.get("id") != expected_id
            or book.get("subject") != expected_subject
            or book.get("grade") != expected_grade
        ):
            raise ValueError(f"教材登记信息不一致：{expected_id}")
        if len(book["units"]) != expected_count:
            raise ValueError(f"语文英语单元目录不完整：{book['id']}")
        for unit in book["units"]:
            if unit["id"] in language_units or len(unit["skills"]) != 4:
                raise ValueError("单元或知识点登记无效")
            skill_ids = {skill["id"] for skill in unit["skills"]}
            if len(skill_ids) != 4 or any(not skill["guide"] for skill in unit["skills"]):
                raise ValueError("知识点及讲解不能为空")
            prompts = set()
            for bank_name in ("questions", "retestQuestions"):
                bank = unit[bank_name]
                if len(bank) != 4 or {q["skillId"] for q in bank} != skill_ids:
                    raise ValueError("首测和过关题必须覆盖本单元全部知识点")
                for question in bank:
                    options = question["options"]
                    if (question["id"] in question_ids or question["prompt"] in prompts
                        or len(options) != 3
                        or len({option["id"] for option in options}) != 3
                        or len({option["text"] for option in options}) != 3
                        or question["answer"] not in {option["id"] for option in options}
                        or not question["explanation"]):
                        raise ValueError(f"题目或答案无效：{question['id']}")
                    question_ids.add(question["id"])
                    prompts.add(question["prompt"])
            language_units[unit["id"]] = (book, unit)
            language_tasks[f"language-{unit['id']}"] = (book, unit)
    return language_units, language_tasks


LANGUAGE_UNITS, LANGUAGE_TASKS = build_language_curriculum_indexes(LANGUAGE_BOOKS)


def validate_language_evidence(unit, evidence, reflection):
    """核验完整两轮作答；首测允许答错，独立过关题必须全对。"""
    if evidence.get("kind") != "language_unit":
        raise ValueError("请提交本单元的首测与过关作答")
    for bank_name, field in (("questions", "diagnosis_answers"), ("retestQuestions", "answers")):
        bank = unit[bank_name]
        submitted = evidence.get(field)
        if not isinstance(submitted, dict) or set(submitted) != {q["id"] for q in bank}:
            raise ValueError("作答不完整或混入其他单元题目，请完成本单元全部题目")
        if any(submitted[q["id"]] not in {o["id"] for o in q["options"]} for q in bank):
            raise ValueError("作答包含无效选项")
        if field == "answers" and any(submitted[q["id"]] != q["answer"] for q in bank):
            raise ValueError("过关题尚未全部答对，请查看讲解后再试")
    if len(reflection.strip()) < 12:
        raise ValueError("请至少写 12 个字的学习反思，说明学会的方法或需要继续练习的地方")
