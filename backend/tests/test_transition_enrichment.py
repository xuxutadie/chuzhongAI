"""访谈分支和题图是可核验的数据，不由模型临时猜测。"""
import unittest
import tempfile
import json
import re
from pathlib import Path

from app.services.transition_bank import build_paper, public_paper


class EnrichmentTests(unittest.TestCase):
    def test_every_paper_has_geometry_and_at_least_six_visible_diagrams(self):
        for score in (30, 95):
            paper = build_paper({"exam_score": score, "exam_total": 100}, "figures")
            self.assertGreaterEqual(sum(bool(q.get("diagram")) for q in paper), 6)
            for q in paper:
                if q["dimension"] == 3:
                    self.assertTrue(q.get("diagram"))
            self.assertEqual(len(public_paper(paper)), 24)

    def test_interview_has_fourteen_core_questions_and_targeted_branches(self):
        from app.services.transition_interview import interview_for
        basic = interview_for({})
        self.assertEqual(len(basic), 14)
        fields = {"weak_topics": "几何与图形", "goal": "补齐基础", "learning_details": {
            "progress": "分数", "study_habit": "先独立思考", "confidence": "有点担心"}}
        rows = interview_for(fields)
        self.assertIn("geometry_detail", [q["field"] for q in rows])
        self.assertNotIn("calculation_detail", [q["field"] for q in rows])
        self.assertGreaterEqual(len(rows), 16)
        self.assertLessEqual(len(rows), 20)

    def test_extended_profile_preserves_legacy_defaults_and_validates_details(self):
        from app.schemas.transition_diagnosis import ProfileFields
        from pydantic import ValidationError
        old = ProfileFields(nickname="同学", grade="六年级", textbook="人教版")
        self.assertEqual(old.learning_details, {})
        value = ProfileFields(learning_details={"progress": "百分数"}, answered_fields=[str(i) for i in range(18)])
        self.assertEqual(value.learning_details["progress"], "百分数")
        with self.assertRaises(ValidationError):
            ProfileFields(learning_details={"progress": "长" * 401})

    def test_old_active_paper_is_not_replaced_or_reversioned(self):
        from app.services.transition_diagnosis import DiagnosisService
        with tempfile.TemporaryDirectory() as directory:
            service = DiagnosisService(Path(directory) / "qa.db")
            service.save_profile(1, 0, {"nickname": "测试", "grade": "六年级", "textbook": "不确定", "school_name": "学校", "class_name": "一班"}, True)
            attempt = service.start(1)
            paper = build_paper({}, "legacy")
            for question in paper:
                question.pop("diagram", None)
            with service.connection() as db:
                db.execute("UPDATE diagnosis_attempts SET paper_json=?, version=? WHERE id=?", (json.dumps(paper), "math-transition-2026.1", attempt["id"]))
            resumed = service.start(1)
            self.assertEqual(resumed["id"], attempt["id"])
            self.assertFalse(any(q.get("diagram") for q in resumed["paper"]))
            submitted = service.submit(1, attempt["id"], 0)
            self.assertEqual(submitted["report"]["version"], "math-transition-2026.1")

    def test_pdf_includes_diagram_appendix_but_legacy_report_stays_six_pages(self):
        from app.services.transition_pdf import render_report
        from app.services.transition_bank import grade_paper, VERSION
        paper = build_paper({}, "pdf")
        attempt = {"profile": {}, "report": grade_paper(paper, {}), "version": VERSION}
        new_pdf = render_report(attempt)
        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", new_pdf)), 9)
        for question in attempt["report"]["evidence"]:
            question.pop("diagram", None)
        legacy_pdf = render_report(attempt)
        self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", legacy_pdf)), 6)


if __name__ == "__main__":
    unittest.main()
