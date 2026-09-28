"""读取前后端共享的已审核教材能力包，不接收浏览器提供的答案表。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CURRICULUM_DIRECTORY = Path(__file__).resolve().parents[3] / "shared" / "curriculum" / "g7-upper"


def load_additional_chapters() -> tuple[dict[str, Any], ...]:
    chapters = []
    question_ids: set[str] = set()
    point_ids: set[str] = set()
    # 显式文件清单避免把临时草稿自动登记成正式题库；缺文件应在启动时明确失败。
    for number in range(2, 7):
        chapter = json.loads((CURRICULUM_DIRECTORY / f"chapter-{number}.json").read_text(encoding="utf-8"))
        if chapter["id"] != f"g7u-chapter-{number}" or len(chapter["packages"]) != 4:
            raise ValueError(f"第 {number} 章课程结构无效")
        for pack in chapter["packages"]:
            if pack["id"] in point_ids or pack["chapterId"] != chapter["id"]:
                raise ValueError("知识点编号重复或章节归属无效")
            point_ids.add(pack["id"])
            for bank in (pack["questions"], pack["retestQuestions"]):
                if len(bank) != 10:
                    raise ValueError("首测和过关题库分别需要 10 道题")
                for question in bank:
                    if question["id"] in question_ids or question["knowledgePointId"] != pack["id"]:
                        raise ValueError("题号重复或题目归属无效")
                    question_ids.add(question["id"])
                    options = question["options"]
                    option_ids = {option["id"] for option in options}
                    answer = question["correctAnswer"]
                    answers = answer if isinstance(answer, list) else [answer]
                    if (len(option_ids) != len(options) or not answers
                            or any(not isinstance(item, str) or item not in option_ids for item in answers)):
                        raise ValueError("可信答案必须引用现有选项")
        chapters.append(chapter)
    return tuple(chapters)


ADDITIONAL_CHAPTERS = load_additional_chapters()
ADDITIONAL_COURSE_CHAPTERS = tuple({
    "id": chapter["id"], "title": chapter["title"],
    "knowledge_points": tuple({"id": pack["id"], "title": pack["title"]} for pack in chapter["packages"]),
} for chapter in ADDITIONAL_CHAPTERS)
ADDITIONAL_QUESTIONS = {
    question["id"]: question
    for chapter in ADDITIONAL_CHAPTERS
    for pack in chapter["packages"]
    for bank in (pack["questions"], pack["retestQuestions"])
    for question in bank
}
