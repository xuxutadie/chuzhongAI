import assert from "node:assert/strict";
import test from "node:test";

import {
  getSafeNextPath,
  getRoleHomePath,
  isRoleAllowed,
  loginRedirectPath,
} from "../app/student-session-model.ts";

test("学生和教师登录后进入各自真实入口", () => {
  assert.equal(getRoleHomePath("student"), "/dashboard");
  assert.equal(getRoleHomePath("admin"), "/admin");
});

test("学生不能访问教师配置，教师不被带到学生首页", () => {
  assert.equal(isRoleAllowed("student", ["admin"]), false);
  assert.equal(isRoleAllowed("admin", ["student"]), false);
  assert.equal(loginRedirectPath("/today-learning"), "/login?next=%2Ftoday-learning");
});

test("登录回跳只接受站内安全路径，拒绝反斜杠和伪协议跳转", () => {
  assert.equal(getSafeNextPath("/today-learning?from=login"), "/today-learning?from=login");
  assert.equal(getSafeNextPath("//evil.example"), null);
  assert.equal(getSafeNextPath("/\\evil.example"), null);
  assert.equal(getSafeNextPath("/%5Cevil.example"), null);
  assert.equal(getSafeNextPath("/\u0000evil"), null);
});
