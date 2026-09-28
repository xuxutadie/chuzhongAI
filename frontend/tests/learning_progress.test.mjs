import assert from "node:assert/strict";
import test from "node:test";

import {
  completeTask,
  createDailyProgress,
  getDailyProgressStorageKey,
  getCompletionRate,
  getCurrentTaskId,
  getTaskAvailability,
  loadDailyProgress,
  saveDailyProgress,
  startTask
} from "../app/learning-progress.ts";
import { DAILY_MATH_TASK_ID, initialTasks } from "../app/student-data.ts";

const taskIds = ["math", "english", "chinese"];
const dateKey = "2026-09-02";

test("新的一天只开放第一项任务", () => {
  const progress = createDailyProgress(taskIds, dateKey);

  assert.equal(getCurrentTaskId(progress, taskIds), "math");
  assert.equal(getTaskAvailability(progress, taskIds, "math"), "available");
  assert.equal(getTaskAvailability(progress, taskIds, "english"), "locked");
});

test("不能跳过第一项直接开始第二项", () => {
  const progress = createDailyProgress(taskIds, dateKey);
  const next = startTask(progress, taskIds, "english", "2026-09-02T10:00:00.000Z");

  assert.deepEqual(next, progress);
});

test("完成第一项后自动开放第二项并更新完成率", () => {
  const progress = createDailyProgress(taskIds, dateKey);
  const started = startTask(progress, taskIds, "math", "2026-09-02T10:00:00.000Z");
  const completed = completeTask(started, taskIds, "math", "我会先判断是不是同类项。", "2026-09-02T10:20:00.000Z");

  assert.equal(getTaskAvailability(completed, taskIds, "math"), "completed");
  assert.equal(getTaskAvailability(completed, taskIds, "english"), "available");
  assert.equal(getCurrentTaskId(completed, taskIds), "english");
  assert.equal(getCompletionRate(completed, taskIds), 33);
  assert.equal(completed.growthEarned, 40);
});

test("同一项任务被重复完成时不会重复增加成长值", () => {
  const started = startTask(createDailyProgress(taskIds, dateKey), taskIds, "math", "2026-09-02T10:00:00.000Z");
  const completed = completeTask(started, taskIds, "math", "完成图形诊断。", "2026-09-02T10:20:00.000Z");
  const repeated = completeTask(completed, taskIds, "math", "重复提交不应加分。", "2026-09-02T10:21:00.000Z");

  assert.equal(repeated, completed);
  assert.equal(repeated.growthEarned, 40);
});

test("不同日期会建立新的每日进度", () => {
  const progress = createDailyProgress(taskIds, "2026-09-03");

  assert.equal(progress.dateKey, "2026-09-03");
  assert.equal(getCompletionRate(progress, taskIds), 0);
});

test("每日学习进度按日期分开保存，今天不会覆盖昨天", () => {
  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const firstDay = completeTask(
    startTask(createDailyProgress(taskIds, "2026-09-02"), taskIds, "math", "2026-09-02T08:00:00.000Z"),
    taskIds,
    "math",
    "完成图形诊断。",
    "2026-09-02T08:20:00.000Z"
  );
  const secondDay = createDailyProgress(taskIds, "2026-09-03");

  assert.equal(saveDailyProgress(firstDay, fakeStorage), true);
  assert.equal(saveDailyProgress(secondDay, fakeStorage), true);
  assert.notEqual(
    getDailyProgressStorageKey(firstDay.dateKey),
    getDailyProgressStorageKey(secondDay.dateKey)
  );
  assert.equal(loadDailyProgress(taskIds, "2026-09-02", fakeStorage).growthEarned, 40);
  assert.equal(loadDailyProgress(taskIds, "2026-09-03", fakeStorage).growthEarned, 0);
});

test("每日学习进度存储被拒绝时安全降级且不抛错", () => {
  const blockedStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
    removeItem() { throw new Error("storage blocked"); }
  };
  const progress = createDailyProgress(taskIds, "2026-09-03");

  assert.equal(saveDailyProgress(progress, blockedStorage), false);
  assert.deepEqual(loadDailyProgress(taskIds, "2026-09-03", blockedStorage), progress);
});

test("今日首项与真实数学诊断内容一致，互动代数课不冒充今日首项", () => {
  assert.equal(DAILY_MATH_TASK_ID, "math-shapes-diagnosis");
  assert.equal(initialTasks[0]?.id, DAILY_MATH_TASK_ID);
  assert.equal(initialTasks[0]?.title, "数学课堂诊断");
  assert.equal(initialTasks[0]?.learningHref, "/today-learning");
  assert.equal(initialTasks.some((task) => task.learningHref.includes("g7-upper-algebra")), false);
});
