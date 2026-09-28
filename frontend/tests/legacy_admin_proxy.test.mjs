import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const routePaths = [
  "../app/api/admin/assistant-test/route.ts",
  "../app/api/admin/model-connection-test/route.ts",
  "../app/api/admin/math-question-generation-test/route.ts",
];

test("旧版管理测试代理不再转发到已失效的 8001 服务", () => {
  for (const relativePath of routePaths) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.equal(source.includes("127.0.0.1:8001"), false, relativePath);
    assert.match(source, /410/);
  }
});
