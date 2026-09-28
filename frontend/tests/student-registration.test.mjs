import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildStudentRegistration, getRegistrationDestination } from "../app/student-registration-model.ts";
import { normalizeWorkspaceUser, registerStudent } from "../app/student-api.ts";

test("学生注册清理账号和称呼，但不改变密码", () => {
  assert.deepEqual(buildStudentRegistration({ username: " learner ", displayName: " 小林 ", grade: "七年级", password: " password8 ", confirmPassword: " password8 " }), {
    username: "learner", displayName: "小林", grade: "七年级", password: " password8 ",
  });
});

test("学生注册拒绝密码不一致、短密码与空称呼", () => {
  const input = { username: "learner", displayName: "小林", grade: "七年级", password: "password8", confirmPassword: "password8" };
  assert.throws(() => buildStudentRegistration({ ...input, confirmPassword: "different" }), /两次密码/);
  assert.throws(() => buildStudentRegistration({ ...input, password: "123", confirmPassword: "123" }), /至少 8/);
  assert.throws(() => buildStudentRegistration({ ...input, displayName: " " }), /称呼/);
  assert.throws(() => buildStudentRegistration({ ...input, displayName: "林".repeat(41) }), /40/);
  assert.throws(() => buildStudentRegistration({ ...input, password: "a".repeat(257), confirmPassword: "a".repeat(257) }), /256/);
});

test("学生自主注册后固定先进入访谈建档，不被 next 参数覆盖", () => {
  assert.equal(getRegistrationDestination("register", "/today-learning", "student"), "/onboarding");
  assert.equal(getRegistrationDestination("login", "/today-learning", "student"), "/today-learning");
  assert.equal(getRegistrationDestination("bootstrap", null, "admin"), "/admin");
});

test("公开账号识别个人模式，旧账号兼容托管且丢弃秘密字段", () => {
  const oldUser = normalizeWorkspaceUser({ id: 1, username: "test", display_name: "测试", role: "student", grade: null, access_token: "secret" });
  assert.equal(oldUser.ai_access_mode, "managed");
  assert.equal("access_token" in oldUser, false);
  assert.equal(normalizeWorkspaceUser({ ...oldUser, ai_access_mode: "personal" }).ai_access_mode, "personal");
});

test("注册使用同源接口、返回公开账号且不传入模式或教师权限", async () => {
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (path, init) => {
    sent = { path, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ user: { id: 12, username: "learner", display_name: "小林", role: "student", grade: "七年级", ai_access_mode: "personal", api_key: "never-copy" } }), { status: 201 });
  };
  try {
    const user = await registerStudent({ username: "learner", password: "password8", displayName: "小林", grade: "七年级" });
    assert.equal(sent.path, "/api/auth/register");
    assert.equal(sent.init.credentials, "same-origin");
    assert.deepEqual(sent.body, { username: "learner", password: "password8", display_name: "小林", grade: "七年级" });
    assert.equal(user.ai_access_mode, "personal");
    assert.equal("api_key" in user, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("注册代理沿用安全 Cookie 并限制请求体，页面显示个人 API 费用说明", () => {
  const route = fs.readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
  const login = fs.readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(route, /relayRegistrationRequest/);
  assert.match(login, /学生注册/);
  assert.match(login, /费用/);
  assert.match(login, /getRegistrationDestination/);
});
