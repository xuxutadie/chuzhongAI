import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const frontendRoot = new URL("../", import.meta.url);

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, frontendRoot), "utf8");
}

test("AI 设置页不再收集或在浏览器中保存密钥", () => {
  const source = read("app/model-config/page.tsx");

  assert.equal(source.includes("apiKey"), false);
  assert.equal(source.includes("SecretKey"), false);
  assert.equal(source.includes("model-connection-test"), false);
  assert.match(source, /服务器.*\.env/);
});

test("学生答疑只经由受保护的同源 BFF 转发", () => {
  const page = read("app/assistant/page.tsx");
  const route = read("app/api/student/assistant/route.ts");
  const runtime = read("app/ai-runtime-client.ts");

  assert.equal(page.includes("/api/admin/assistant-test"), false);
  assert.match(page, /askStudentAssistant/);
  assert.match(route, /relayAuthenticatedRequest/);
  assert.match(route, /"\/assistant"/);
  assert.match(runtime, /notifySessionExpired\(path, response\.status, requestSessionEpoch\)/);
});

test("教师只能读取非敏感 AI 配置状态", () => {
  const route = read("app/api/teacher/ai-config/status/route.ts");

  assert.match(route, /relayAuthenticatedRequest/);
  assert.match(route, /"\/teacher\/ai-config\/status"/);
  assert.equal(route.includes("api_key"), false);
  assert.equal(route.includes("secret"), false);
});
