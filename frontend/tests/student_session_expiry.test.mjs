import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("受保护请求返回 401 时会通知会话层并给出重新登录提示", () => {
  const api = read("../app/student-api.ts");
  const provider = read("../app/components/student_session_provider.tsx");
  const login = read("../app/login/page.tsx");

  assert.match(api, /ai-coach-session-expired/);
  assert.match(provider, /SESSION_EXPIRED_EVENT/);
  assert.match(provider, /登录会话已失效，请重新登录/);
  assert.match(login, /sessionError/);
});
