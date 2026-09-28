"""题图语义、旧快照保护以及报告图表的回归检查。"""
import copy
from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from app.services.transition_bank import BANK, build_paper, grade_paper, public_paper
from app.services.transition_diagrams import diagram_for
from app.services.transition_pdf import render_report


def old_grid():
    # 保留故障样本，避免测试数据随着实现一起变化。
    elements = [{"kind": "polygon", "points": [[55+c*32,55+r*32], [83+c*32,55+r*32],
                [83+c*32,83+r*32], [55+c*32,83+r*32]],
                "fill": "#c4daf5" if r == 0 else "#ffffff"} for r in range(4) for c in range(10)]
    elements.append({"kind": "text", "x": 220, "y": 214, "text": "每格 1 人 · 蓝色：篮球 · 白色：其他"})
    return {"width": 440, "height": 260,
            "alt": "调查 40 人，篮球 10 人，其他 30 人。方格中每格代表 1 人，蓝色为篮球，白色为其他。",
            "elements": elements}


class QuestionChartTests(unittest.TestCase):
    def test_all_thirty_bank_answers_and_shuffled_options_remain_consistent(self):
        expected = ["29", "1", "36", "3700", "5", "5/6", "20", "3/2", "192", "7/20",
                    "2:3", "24", "3", "40", "8", "26", "30", "27", "28.26", "115",
                    "80", "25%", "条形统计图", "平均数为 6", "3/5", "12", "5a", "15", "5", "5a"]
        self.assertEqual([q["options"][q["answer"]] for q in BANK], expected)
        expected_by_id = {q["id"]: value for q, value in zip(BANK, expected)}
        for score in (0, 79, 80, 100):
            for seed in range(20):
                paper = build_paper({"exam_score": score, "exam_total": 100}, seed)
                for q in paper:
                    self.assertEqual(q["options"][q["answer"]], expected_by_id[q["id"]])
                    self.assertEqual(len(set(q["options"].values())), 4)

    def test_pie_question_has_two_sectors_without_answer_labels(self):
        diagram = diagram_for("t1-4-1")
        sectors = [e for e in diagram["elements"] if e["kind"] == "sector"]
        self.assertEqual(len(sectors), 2)
        self.assertEqual([e["endAngle"] - e["startAngle"] for e in sectors], [90, 270])
        self.assertEqual(sectors[0]["endAngle"], sectors[1]["startAngle"])
        self.assertEqual({(e["cx"], e["cy"], e["r"]) for e in sectors}, {(130, 125, 85)})
        labels = diagram["alt"] + " ".join(e.get("text", "") for e in diagram["elements"])
        for leaked in ("25%", "75%", "90°", "270°"):
            self.assertNotIn(leaked, labels)

    def test_old_grid_is_corrected_for_display_without_changing_snapshot(self):
        question = copy.deepcopy(next(q for q in BANK if q["id"] == "t1-4-1"))
        question["diagram"] = old_grid()
        original = copy.deepcopy(question)
        visible = public_paper([question])[0]
        self.assertEqual(question, original)
        self.assertTrue(any(e["kind"] == "sector" for e in visible["diagram"]["elements"]))
        self.assertIn("更正", visible["diagram"]["caption"])
        self.assertEqual(visible["options"], original["options"])
        self.assertNotIn("answer", visible)

    def test_legacy_without_diagrams_is_untouched(self):
        question = copy.deepcopy(next(q for q in BANK if q["id"] == "t1-4-1"))
        self.assertNotIn("diagram", public_paper([question])[0])

    def test_existing_attempt_and_report_correct_display_but_never_write_snapshot(self):
        from app.services.transition_diagnosis import DiagnosisService
        with tempfile.TemporaryDirectory() as directory:
            service = DiagnosisService(Path(directory) / "qa.db")
            service.save_profile(1, 0, {"nickname": "测试", "grade": "六年级", "textbook": "人教版", "school_name": "学校", "class_name": "一班"}, True)
            attempt = service.start(1)
            paper = build_paper({}, "legacy-pie")
            next(q for q in paper if q["id"] == "t1-4-1")["diagram"] = old_grid()
            report = grade_paper(paper, {q["id"]: q["answer"] for q in paper})
            with service.connection() as db:
                db.execute("UPDATE diagnosis_attempts SET paper_json=?, report_json=?, status='submitted', version='math-transition-2026.2' WHERE id=?",
                           (json.dumps(paper), json.dumps(report), attempt["id"]))
                before = tuple(db.execute("SELECT * FROM diagnosis_attempts WHERE id=?", (attempt["id"],)).fetchone())
            visible = service.get_attempt(1, attempt["id"])
            for rows in (visible["paper"], visible["report"]["evidence"]):
                q = next(q for q in rows if q["id"] == "t1-4-1")
                self.assertEqual(q["diagram"]["elements"][0]["kind"], "sector")
            self.assertEqual(visible["report"]["score"], report["score"])
            self.assertEqual(visible["version"], "math-transition-2026.2")
            render_report(visible)
            with service.connection() as db:
                after = tuple(db.execute("SELECT * FROM diagnosis_attempts WHERE id=?", (attempt["id"],)).fetchone())
            self.assertEqual(before, after)


class ReportChartTests(unittest.TestCase):
    def test_radar_full_score_markers_do_not_touch_value_labels(self):
        paper = build_paper({}, "full-radar")
        report = grade_paper(paper, {q["id"]: q["answer"] for q in paper})
        for q in report["evidence"]:
            q.pop("diagram", None)
        pdf = canvas.Canvas(BytesIO())
        with patch("app.services.transition_pdf.canvas.Canvas", return_value=pdf), \
                patch.object(pdf, "drawString", wraps=pdf.drawString) as strings, \
                patch.object(pdf, "circle", wraps=pdf.circle) as circles:
            render_report({"profile": {}, "report": report, "version": "test"})
        labels = [call.args for call in strings.call_args_list if call.args[2] == "100% · 4/4 题"]
        self.assertEqual(len(labels), 6)
        markers = [call.args for call in circles.call_args_list if call.args[2] == 2.8]
        self.assertEqual(len(markers), 6)
        for x, y, value in labels:
            label_width = pdfmetrics.stringWidth(value, "DiagnosisCN", 9)
            for px, py, _ in markers:
                self.assertFalse(x-5 <= px <= x+label_width+5 and y-7 <= py <= y+14,
                                 "满分顶点不得与旁边的维度数值重叠")

    def test_pie_is_clockwise_and_full_circle_uses_circle_primitive(self):
        paper = build_paper({}, "chart-check")
        for counts in ((12, 8, 4), (24, 0, 0), (0, 24, 0), (0, 0, 24)):
            answers = {}
            for i, q in enumerate(paper):
                if i < counts[0]:
                    answers[q["id"]] = q["answer"]
                elif i < counts[0] + counts[1]:
                    answers[q["id"]] = next(k for k in q["options"] if k != q["answer"])
            report = grade_paper(paper, answers)
            for q in report["evidence"]:
                q.pop("diagram", None)
            pdf = canvas.Canvas(BytesIO())
            with patch("app.services.transition_pdf.canvas.Canvas", return_value=pdf), \
                    patch.object(pdf, "wedge", wraps=pdf.wedge) as wedges:
                render_report({"profile": {}, "report": report, "version": "test"})
            extents = [call.args[5] for call in wedges.call_args_list]
            if 24 in counts:
                self.assertEqual(extents, [], "整圆应单独绘制，避免 360 度扇区的闭合接缝")
            else:
                self.assertEqual(extents, [-180, -120, -60])


if __name__ == "__main__":
    unittest.main()
