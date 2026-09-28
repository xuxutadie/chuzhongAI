import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  clearExpectedSessionUserId,
  getExpectedSessionUserId,
  setExpectedSessionUserId,
} from "../app/session_identity.js";
import {
  isSessionContextChangedResponse,
  SESSION_CONTEXT_CHANGED_HEADER,
} from "../app/session_context_change.js";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("会话身份提示只保存非秘密用户编号，且在切换时可立即清空", () => {
  clearExpectedSessionUserId();
  assert.equal(getExpectedSessionUserId(), null);
  setExpectedSessionUserId(101);
  assert.equal(getExpectedSessionUserId(), 101);
  clearExpectedSessionUserId();
  assert.equal(getExpectedSessionUserId(), null);
});

test("跨标签登录、退出或失效会通知其他标签刷新真实会话", () => {
  const provider = read("../app/components/student_session_provider.tsx");
  const sync = read("../app/session_sync.js");

  assert.match(provider, /subscribeToSessionChanges/);
  assert.match(provider, /publishSessionChange\("signed-in"\)/);
  assert.match(provider, /publishSessionChange\("signed-out"\)/);
  assert.match(provider, /clearExpectedSessionUserId\(\)/);
  assert.match(sync, /BroadcastChannel/);
  assert.match(sync, /storage/);
});

test("受保护请求携带当前页面预期用户，BFF 将其转发到后端防止 B Cookie 接收 A 写入", () => {
  const api = read("../app/student-api.ts");
  const bff = read("../app/api/_backend.ts");
  const upload = read("../app/api/student/wrong-questions/uploads/route.ts");
  const logout = read("../app/api/auth/logout/route.ts");

  assert.match(api, /X-AI-Coach-Expected-User-Id/);
  assert.match(bff, /X-AI-Coach-Expected-User-Id/);
  assert.match(bff, /getExpectedUserHeader/);
  assert.match(upload, /getExpectedUserHeader/);
  assert.match(logout, /getExpectedUserHeader/);
  assert.doesNotMatch(logout, /clearSessionCookie/);
  assert.match(api, /buildProtectedImageUrl/);
  assert.match(bff, /allowQueryFallback/);
  assert.match(bff, /expected_user_id/);
});

test("普通 409 保留给业务页面，只有后端明确标记的账号切换才触发会话刷新", () => {
  const api = read("../app/student-api.ts");
  const bff = read("../app/api/_backend.ts");

  assert.equal(isSessionContextChangedResponse("/api/student/tasks/today", new Response({}, { status: 409 })), false);
  assert.equal(isSessionContextChangedResponse(
    "/api/student/tasks/today",
    new Response({}, { status: 409, headers: { [SESSION_CONTEXT_CHANGED_HEADER]: "1" } }),
  ), true);
  assert.equal(isSessionContextChangedResponse(
    "/api/auth/me",
    new Response({}, { status: 409, headers: { [SESSION_CONTEXT_CHANGED_HEADER]: "1" } }),
  ), false);
  assert.match(api, /isSessionContextChangedResponse/);
  assert.match(bff, /response\.headers\.get\(SESSION_CONTEXT_CHANGED_HEADER\) === "1"/);
  assert.doesNotMatch(bff, /Boolean\(expectedUserId\).*response\.status === 409/s);
});
