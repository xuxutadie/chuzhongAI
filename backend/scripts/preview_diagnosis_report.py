"""生成纯虚构的排版验收报告，不读取或修改学生数据库。"""
import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.transition_bank import build_paper, grade_paper, VERSION
from app.services.transition_pdf import render_report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--case", choices=("mixed", "perfect", "wrong", "skipped", "long"), default="mixed")
    args = parser.parse_args()
    profile = {"nickname": "排版验收同学（虚构样本）", "grade": "升七年级", "textbook": "北师大版数学",
               "exam_score": 82, "exam_total": 100, "exam_date": "2026 年 6 月", "daily_minutes": 25,
               "learning_details": {"progress": "学完了六年级内容", "geometry_detail": "希望加强看图找条件和面积计算。"}}
    if args.case == "long":
        profile.update(nickname="较长称呼排版验收" * 5, textbook="这是较长的教材名称与使用情况说明" * 5,
                       exam_date="考试时间暂不确定，需要再核对记录。" * 4)
        profile["learning_details"] = {f"{field}": "希望通过独立练习检查理解程度，并在遇到困难时获得提示。" * 14
                                       for field in ("progress", "geometry_detail", "confidence", "study_habit", "goal_detail")}
    paper = build_paper(profile, "report-layout-check")
    answers = {}
    for i, q in enumerate(paper):
        mode = args.case
        if mode == "perfect" or (mode in ("mixed", "long") and i % 4 < 2):
            answers[q["id"]] = q["answer"]
        elif mode == "wrong" or (mode in ("mixed", "long") and i % 4 == 2):
            answers[q["id"]] = next(k for k in q["options"] if k != q["answer"])
    report = grade_paper(paper, answers)
    if args.case == "long":
        report["interpretation"] = ("每天安排少量练习，先说清题意，再写出关键步骤，最后独立检查。" * 8)[:220]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(render_report({"profile": profile, "report": report, "version": VERSION,
                                          "submitted_at": "2026-09-25"}))
    print(args.output)


if __name__ == "__main__":
    main()
