import test from "node:test";
import assert from "node:assert/strict";
import { buildTeacherRegistration, registerTeacher, teacherGet, teacherPost } from "../app/teacher/api.ts";

test("教师资料必填且重复班级去重，密码原样保留", () => {
  const input = { username: "teacher", displayName: " 王老师 ", password: " password8 ", confirmPassword: " password8 ", school: " 实验中学 ", classes: "七年级1班，七年级2班,七年级1班" };
  const value = buildTeacherRegistration(input);
  assert.equal(value.password, input.password);
  assert.deepEqual(value.teaching_classes, ["七年级1班", "七年级2班"]);
  assert.throws(() => buildTeacherRegistration({ ...input, school: " " }), /学校/);
  assert.throws(() => buildTeacherRegistration({ ...input, classes: " " }), /班级/);
  assert.throws(() => buildTeacherRegistration({ ...input, confirmPassword: "other" }), /两次密码/);
});
test("教师注册及认领走固定同源入口", async () => {
  const previous = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (path, init) => {
    sent.push({ path, init });
    return new Response(JSON.stringify({ user: { id: 1, username: "teacher", role: "teacher", display_name: "老师" } }));
  };
  try {
    const user = await registerTeacher({ username: "teacher", password: "password8", display_name: "老师", school_name: "学校", teaching_classes: ["一班"] });
    assert.equal(user.role, "teacher");
    await teacherPost("claims", { code: "TEST", request_id: "request" });
    await teacherGet("profile");
    assert.equal(sent[0].path, "/api/auth/register-teacher");
    assert.equal(sent[1].path, "/api/teacher/workspace/claims");
    assert.equal(sent[1].init.credentials, "same-origin");
  } finally { globalThis.fetch = previous; }
});
