import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from teacher_test_support import TeacherFixture
from app.services.teacher_links import TeacherLinks, require_link
from app.services.student_workspace_service import ResourceNotFoundError, ResourceConflictError, AuthenticationRateLimitError


class TeacherLinksTests(TeacherFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.time = datetime(2026, 9, 26, tzinfo=timezone.utc)
        self.links = TeacherLinks(self.repo, lambda: self.time)
        self.student = self.workspace.register_student(username="student-one", password="student-password", display_name="学生")["user"]["id"]
        self.teacher = self.register_teacher().json()["user"]["id"]
        self.other = self.register_teacher("teacher-two").json()["user"]["id"]

    def test_single_use_expiry_hash_and_replacement(self):
        old = self.links.issue_code(self.student)
        code = self.links.issue_code(self.student)
        self.assertEqual(len(code["code"]), 12)
        self.assertEqual(datetime.fromisoformat(code["expires_at"]) - self.time, timedelta(minutes=30))
        with self.assertRaises(ResourceNotFoundError):
            self.links.claim(self.teacher, old["code"], "old")
        with self.repo.read() as db:
            self.assertNotIn(code["code"], str([dict(r) for r in db.execute("SELECT * FROM student_claim_codes")]))
        self.time += timedelta(minutes=30)
        with self.assertRaises(ResourceNotFoundError):
            self.links.claim(self.teacher, code["code"], "expired")

    def test_concurrent_consume_receipt_and_revoke(self):
        code = self.links.issue_code(self.student)["code"]
        def claim(teacher):
            try:
                return teacher, self.links.claim(teacher, code, "same-request")
            except ResourceNotFoundError:
                return teacher, None
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(claim, [self.teacher, self.other]))
        winners = [(t, r) for t, r in outcomes if r]
        self.assertEqual(len(winners), 1)
        teacher, receipt = winners[0]
        self.assertEqual(self.links.claim(teacher, code.lower(), "same-request"), receipt)
        with self.assertRaises(ResourceConflictError):
            self.links.claim(teacher, "different", "same-request")
        with self.repo.read() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM teacher_action_events WHERE actor_id=? AND kind='claim'", (teacher,)).fetchone()[0], 1)
        self.links.revoke(self.student, "student", receipt["link_id"])
        with self.assertRaises(ResourceNotFoundError):
            self.links.claim(teacher, code, "same-request")
        with self.repo.read() as db:
            with self.assertRaises(ResourceNotFoundError):
                require_link(db, teacher, self.student)

    def test_durable_rate_limit_including_failures(self):
        for i in range(10):
            with self.assertRaises(ResourceNotFoundError):
                self.links.claim(self.teacher, "invalid", str(i))
        with self.assertRaises(AuthenticationRateLimitError):
            TeacherLinks(self.repo, lambda: self.time).claim(self.teacher, "invalid", "11")
        self.time += timedelta(minutes=10)
        with self.assertRaises(ResourceNotFoundError):
            self.links.claim(self.teacher, "invalid", "12")
        for _ in range(10):
            self.links.issue_code(self.student)
        with self.assertRaises(AuthenticationRateLimitError):
            self.links.issue_code(self.student)
        self.time += timedelta(hours=1)
        self.links.issue_code(self.student)

    def test_two_teachers_and_reactivation_do_not_restore_old_receipt(self):
        first_code = self.links.issue_code(self.student)["code"]
        first = self.links.claim(self.teacher, first_code, "first")
        other = self.links.claim(self.other, self.links.issue_code(self.student)["code"], "second")
        self.assertEqual(len(self.links.list_for_student(self.student)), 2)
        with self.assertRaises(ResourceNotFoundError):
            self.links.revoke(self.other, "teacher", first["link_id"])
        self.links.revoke(self.teacher, "teacher", first["link_id"])
        self.links.claim(self.teacher, self.links.issue_code(self.student)["code"], "new")
        with self.assertRaises(ResourceNotFoundError):
            self.links.claim(self.teacher, first_code, "first")
        with self.repo.read() as db:
            self.assertIsNone(db.execute("SELECT created_by FROM users WHERE id=?", (self.student,)).fetchone()[0])
        self.assertNotEqual(first["link_id"], other["link_id"])
