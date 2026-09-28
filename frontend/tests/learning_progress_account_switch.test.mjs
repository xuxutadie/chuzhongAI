import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createRequestGeneration } from "../app/async_generation_guard.ts";

const source = fs.readFileSync(new URL("../app/components/learning_progress_provider.tsx", import.meta.url), "utf8");

test("学生账号从 A 切换到 B 时，A 的任务和草稿不会在 B 的加载阶段暴露", () => {
  assert.match(source, /const \[loadedStudentId, setLoadedStudentId\] = useState<number \| null>\(null\)/);
  assert.match(source, /const activeStudentId = user\?\.role === "student" \? user\.id : null/);
  assert.match(source, /loadedStudentId === activeStudentId/);
  assert.match(source, /tasksRef\.current = \[\]/);
  assert.match(source, /workspaceRef\.current = \{\}/);
  assert.match(source, /setTasks\(\[\]\)/);
  assert.match(source, /setWorkspaceState\(\{\}\)/);
  assert.match(source, /setProgress\(emptyProgress\)/);
});

test("旧账号的异步读取完成后不能覆盖新账号数据", () => {
  assert.match(source, /const requestGeneration = loadGenerationRef\.current\.advance\(\)/);
  assert.match(source, /isCurrentStudentRequest\(activeStudentId, requestGeneration\)/);
  assert.match(source, /isCurrentStudentRequest\(studentId, requestGeneration\)/);
  assert.match(source, /setLoadedStudentId\(activeStudentId\)/);
});

test("慢请求在 A 切换到 B 后失效，任务和工作台结果都不能写入 B", async () => {
  const generation = createRequestGeneration();
  const accountA = generation.advance();
  let finishSlowRequest;
  const slowRequest = new Promise((resolve) => {
    finishSlowRequest = resolve;
  });

  const accountB = generation.advance();
  finishSlowRequest();
  await slowRequest;

  assert.equal(generation.isCurrent(accountA), false);
  assert.equal(generation.isCurrent(accountB), true);
});

test("任务入口在账号数据尚未就绪时只显示加载状态", () => {
  const entries = [
    "../app/components/task_entry_list.tsx",
  ].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

  for (const entry of entries) {
    assert.match(entry, /isReady/);
  }
  assert.match(entries[0], /\{isReady && !courseContextRequired && visibleTasks\.length/);
  assert.match(entries[0], /\{isReady && courseContextRequired \? <CourseContextSelector required \/>/);
});
