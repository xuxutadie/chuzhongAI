import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  advanceSessionEpoch,
  getSessionEpoch,
  isCurrentSessionEpoch,
} from "../app/session_epoch.js";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("A 的慢 401 在 B 登录后不再代表当前会话失效", () => {
  const beforeA = getSessionEpoch();
  const requestFromA = advanceSessionEpoch();
  const loginAsB = advanceSessionEpoch();

  assert.equal(requestFromA > beforeA, true);
  assert.equal(isCurrentSessionEpoch(requestFromA), false);
  assert.equal(isCurrentSessionEpoch(loginAsB), true);
});

test("401 通知携带发起请求时的 epoch，Provider 只处理当前 epoch", () => {
  const api = read("../app/student-api.ts");
  const runtime = read("../app/ai-runtime-client.ts");
  const provider = read("../app/components/student_session_provider.tsx");

  assert.match(api, /const requestSessionEpoch = getSessionEpoch\(\)/);
  assert.match(api, /new CustomEvent/);
  assert.match(api, /sessionEpoch/);
  assert.match(runtime, /const requestSessionEpoch = getSessionEpoch\(\)/);
  assert.match(provider, /isCurrentSessionEpoch\(sessionEpoch\)/);
});

test("迟到的受保护请求和退出响应都不会清除可能已换成 B 的固定 Cookie", () => {
  const backend = read("../app/api/_backend.ts");
  const logout = read("../app/api/auth/logout/route.ts");
  const provider = read("../app/components/student_session_provider.tsx");
  const relay = backend.slice(backend.indexOf("export async function relayBackendResponse"), backend.indexOf("export async function relayAuthenticatedRequest"));

  assert.doesNotMatch(relay, /clearSessionCookie/);
  assert.doesNotMatch(logout, /clearSessionCookie/);
  assert.match(provider, /const currentUser = await refreshSession\(\)/);
});
