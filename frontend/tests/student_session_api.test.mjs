import assert from "node:assert/strict";
import test from "node:test";

import {
  createSameOriginRequest,
  getWorkspaceEntry,
  normalizeTodayTasks,
  setWorkspaceEntry,
} from "../app/student-api.ts";

test("学生 API 请求只走同源路径且不由浏览器附带令牌", () => {
  const request = createSameOriginRequest({ method: "GET" });

  assert.equal(request.credentials, "same-origin");
  assert.equal(request.headers.get("Authorization"), null);
  assert.equal(request.headers.get("Content-Type"), null);
});

test("服务端今日任务会保留真实状态与学习链接", () => {
  const tasks = normalizeTodayTasks({
    task_date: "2026-09-05",
    growth_earned: 40,
    tasks: [
      {
        id: "math-shapes-diagnosis",
        subject: "数学",
        title: "课堂诊断：丰富的图形世界",
        objective: "完成课堂诊断",
        learning_href: "/today-learning",
        growth_earned: 40,
        status: "completed",
        started_at: "2026-09-05T08:00:00.000Z",
        completed_at: "2026-09-05T08:20:00.000Z",
        reflection: "完成诊断"
      }
    ]
  });

  assert.equal(tasks.taskDate, "2026-09-05");
  assert.equal(tasks.growthEarned, 40);
  assert.equal(tasks.tasks[0]?.learningHref, "/today-learning");
  assert.equal(tasks.tasks[0]?.status, "completed");
});

test("工作台草稿按功能和项目编号写入，不会覆盖其它草稿", () => {
  const initial = { guidedTaskDrafts: { "english-20": { reflection: "词汇草稿" } } };
  const withMath = setWorkspaceEntry(initial, "mathSessions", "2026-09-05", { phase: "diagnostic" });

  assert.deepEqual(getWorkspaceEntry(withMath, "guidedTaskDrafts", "english-20"), { reflection: "词汇草稿" });
  assert.deepEqual(getWorkspaceEntry(withMath, "mathSessions", "2026-09-05"), { phase: "diagnostic" });
});
