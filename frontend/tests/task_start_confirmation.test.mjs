import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("进入可计入今日路线的数学和引导任务前必须等待服务端确认", () => {
  const math = source("../app/components/math_learning_workspace.tsx");
  const guided = source("../app/components/guided_task_session.tsx");
  const dashboard = source("../app/components/student_dashboard.tsx");

  assert.match(math, /const started = await startTask\(mathTaskId\)/);
  assert.match(math, /tasks\.find\(\(task\) => task\.id === DAILY_MATH_TASK_ID\)/);
  assert.match(guided, /const started = await startTask\(activity\.taskId\)/);
  assert.match(math, /服务端未确认/);
  assert.match(guided, /服务端未确认/);
  assert.match(dashboard, /const started = await startTask\(currentTask\.id\)/);
  assert.match(dashboard, /服务端还没有确认任务开始/);
});

test("独立互动课不偷偷启动无法由它完成的今日任务", () => {
  const interactive = source("../app/components/interactive_lesson_player.tsx");

  assert.equal(interactive.includes("startTask("), false);
});
