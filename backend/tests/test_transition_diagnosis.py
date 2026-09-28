"""衔接测评的分数必须来自服务端题目，不接受客户端自报成绩。"""
import tempfile
import unittest
from pathlib import Path

from app.services.transition_diagnosis import DiagnosisService, ConflictError
from app.services.transition_bank import build_paper, grade_paper, public_paper


class TransitionScoringTests(unittest.TestCase):
    def test_paper_balanced_and_answers_private(self):
        paper = build_paper({"grade": "六年级", "exam_score": 60, "exam_total": 100}, "test")
        self.assertEqual(len(paper), 24)
        self.assertEqual(len([q for q in paper if q["stage"] == "transition"]), 6)
        self.assertEqual(len({q["id"] for q in paper}), 24)
        self.assertNotIn("answer", str(public_paper(paper)))
        self.assertEqual({sum(q["dimension"] == d for q in paper) for d in range(6)}, {4})

    def test_perfect_wrong_and_skipped_are_distinct(self):
        paper = build_paper({}, "test")
        answers = {q["id"]: q["answer"] for q in paper}
        report = grade_paper(paper, answers)
        self.assertEqual(report["score"], 100)
        self.assertEqual(report["distribution"], {"correct": 24, "wrong": 0, "skipped": 0})
        report = grade_paper(paper, {paper[0]["id"]: "Z"})
        self.assertEqual(report["distribution"], {"correct": 0, "wrong": 1, "skipped": 23})
        self.assertEqual(report["score"], 0)
        self.assertTrue(all(d["sample_size"] == 4 for d in report["dimensions"]))

    def test_profile_changes_selection(self):
        self.assertNotEqual(build_paper({"exam_score": 90, "exam_total": 100}, "a"),
                            build_paper({"exam_score": 40, "exam_total": 100}, "a"))

    def test_retest_preserves_report_and_reuses_active_attempt(self):
        # 使用临时数据库验证重测，不改动学生的真实作答记录。
        with tempfile.TemporaryDirectory() as directory:
            service = DiagnosisService(Path(directory) / "test.db")
            service.save_profile(1, 0, {"nickname": "测试", "grade": "六年级", "textbook": "人教版", "school_name": "学校", "class_name": "一班"}, True)
            original = service.start(1)
            submitted = service.submit(1, original["id"], original["revision"])
            self.assertEqual(service.start(1)["id"], original["id"])

            active = service.start(1, retest=True)
            self.assertNotEqual(active["id"], original["id"])
            self.assertEqual(active["status"], "active")
            self.assertEqual(service.start(1, retest=True)["id"], active["id"])
            self.assertEqual(service.start(1)["id"], active["id"])
            preserved = service.get_attempt(1, original["id"])
            self.assertEqual(preserved["status"], "submitted")
            self.assertEqual(preserved["report"], submitted["report"])
            self.assertEqual(preserved["answers"], submitted["answers"])

    def test_account_isolation_revision_and_immutable_submission(self):
        with tempfile.TemporaryDirectory() as directory:
            service = DiagnosisService(Path(directory) / "test.db")
            state = service.save_profile(1, 0, {"nickname": "测试", "grade": "六年级", "textbook": "人教版", "school_name": "学校", "class_name": "一班"}, True)
            self.assertTrue(state["confirmed"])
            with self.assertRaises(ConflictError):
                service.save_profile(1, 0, {}, False)
            attempt = service.start(1)
            self.assertIsNone(service.state(2)["attempt"])
            self.assertEqual(service.start(1)["id"], attempt["id"])
            saved = service.save_answers(1, attempt["id"], 0, {}, {})
            with self.assertRaises(ConflictError):
                service.save_answers(1, attempt["id"], 0, {}, {})
            submitted = service.submit(1, attempt["id"], saved["revision"])
            self.assertEqual(submitted["report"]["distribution"]["skipped"], 24)
            with self.assertRaises(ConflictError):
                service.save_answers(1, attempt["id"], submitted["revision"], {}, {})
            self.assertEqual(service.submit(1, attempt["id"], submitted["revision"])["report"], submitted["report"])
            with self.assertRaises(KeyError):
                service.get_attempt(2, attempt["id"])


if __name__ == "__main__":
    unittest.main()
