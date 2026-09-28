import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createRequestGeneration } from "../app/async_generation_guard.ts";

const sessionProvider = fs.readFileSync(new URL("../app/components/student_session_provider.tsx", import.meta.url), "utf8");

test("登录或退出会让慢的旧会话查询失效", async () => {
  const generation = createRequestGeneration();
  const slowInitialQuery = generation.advance();
  const loggedInStudent = generation.advance();
  const loggedOut = generation.advance();

  assert.equal(generation.isCurrent(slowInitialQuery), false);
  assert.equal(generation.isCurrent(loggedInStudent), false);
  assert.equal(generation.isCurrent(loggedOut), true);
});

test("会话 Provider 取消旧查询，并且只接受当前 generation 的响应", () => {
  assert.match(sessionProvider, /AbortController/);
  assert.match(sessionProvider, /refreshAbortRef\.current\?\.abort\(\)/);
  assert.match(sessionProvider, /const requestGeneration = invalidateSessionRequest\(\)/);
  assert.match(sessionProvider, /sessionGenerationRef\.current\.isCurrent\(requestGeneration\)/);
  assert.match(sessionProvider, /setAuthenticatedUser/);
  assert.match(sessionProvider, /handleSessionExpired/);
  assert.match(sessionProvider, /const requestGeneration = invalidateSessionRequest\(\)/);
});
