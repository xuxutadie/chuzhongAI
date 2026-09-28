import json
import unittest
from teacher_test_support import TeacherFixture
from app.services.transition_diagnosis import DiagnosisService, ConflictError


class SchoolProfileTests(TeacherFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.service = DiagnosisService(self.path)
        self.fields = {"nickname": "学生", "grade": "七年级", "textbook": "北师大版",
                       "school_name": "实验中学", "class_name": "七年级1班"}

    def test_new_confirmation_requires_school(self):
        with self.assertRaises(ValueError):
            self.service.save_profile(1, 0, {k: v for k, v in self.fields.items() if k != "school_name"}, True)

    def test_supplement_keeps_confirmed_attempt_and_legacy_put(self):
        profile = self.service.save_profile(1, 0, self.fields, True)
        attempt = self.service.start(1)
        before = self.service.get_attempt(1, attempt["id"])
        updated = self.service.update_school(1, profile["revision"], "新的学校", "待分班")
        self.assertTrue(updated["confirmed"])
        self.assertEqual(before, self.service.get_attempt(1, attempt["id"]))
        old_client = {"nickname": "新昵称", "grade": "七年级", "textbook": "北师大版"}
        saved = self.service.save_profile(1, updated["revision"], old_client, True)
        self.assertEqual(saved["fields"]["school_name"], "新的学校")
        with self.assertRaises(ConflictError):
            self.service.update_school(1, profile["revision"], "旧页面", "一班")

    def test_legacy_confirmed_does_not_reset(self):
        fields = {k: v for k, v in self.fields.items() if k not in ("school_name", "class_name")}
        with self.service.connection() as db:
            db.execute("INSERT INTO diagnosis_profiles VALUES (?,?,?,?,?)", (1, json.dumps(fields), 1, 1, "test"))
        self.assertTrue(self.service.save_profile(1, 1, fields, True)["confirmed"])
        self.assertTrue(self.service.update_school(1, 2, "暂未入学", "待分班")["confirmed"])

    def test_patch_validation(self):
        auth = self.workspace.register_student(username="school-student", password="password123", display_name="学生")
        headers = self.headers(auth)
        for school, classroom in [("长" * 101, "一班"), ("学校", "长" * 41), ("", "一班")]:
            response = self.client.patch("/api/v1/me/diagnosis/profile/school", headers=headers,
                                         json={"revision": 0, "school_name": school, "class_name": classroom})
            self.assertEqual(response.status_code, 422)
