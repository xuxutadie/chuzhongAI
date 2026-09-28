import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shellPath = new URL("../app/components/student_page_shell.tsx", import.meta.url);

test("会话服务异常不会伪装成未登录或无限加载", () => {
  const source = fs.readFileSync(shellPath, "utf8");

  assert.match(source, /const \{ logout, status, user, error, refreshSession \} = useStudentSession\(\)/);
  assert.match(source, /账号服务暂时无法连接/);
  assert.match(source, /重新尝试/);
});

test("同一路由从学生 A 切换到学生 B 时，页面局部草稿会随账号边界重建", () => {
  const source = fs.readFileSync(shellPath, "utf8");

  assert.match(source, /key=\{`workspace-user-\$\{user\.id\}`\}/);
  assert.match(source, /isHiddenSubjectPath\(pathname\)/);
  assert.match(source, /: children\}/);
});
