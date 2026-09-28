import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  canCompleteGuidedTask,
  getTaskActivity,
  isActivityAnswerCorrect,
  sanitizeGuidedTaskAnswers
} from "../app/task-activity-data.ts";

test("英语和语文任务都有三步学习内容", () => {
  const english = getTaskActivity("english-20");
  const chinese = getTaskActivity("chinese-20");

  assert.equal(english?.steps.length, 3);
  assert.equal(chinese?.steps.length, 3);
  assert.ok(english?.questions.length >= 2);
  assert.ok(chinese?.questions.length >= 2);
});

test("自测答案能够判断正确与错误", () => {
  const activity = getTaskActivity("english-20");
  assert.ok(activity);

  const question = activity.questions[0];
  assert.equal(isActivityAnswerCorrect(question, question.answer), true);
  assert.equal(isActivityAnswerCorrect(question, "not-the-answer"), false);
});

test("全部答错即使写够总结也不能完成引导任务", () => {
  const activity = getTaskActivity("english-20");
  assert.ok(activity);

  const allWrongAnswers = Object.fromEntries(
    activity.questions.map((question) => [
      question.id,
      question.options.find((option) => option !== question.answer)
    ])
  );

  assert.equal(
    canCompleteGuidedTask(activity, allWrongAnswers, "我认真写了一段足够长的学习总结。"),
    false
  );
});

test("答对达到任务要求且写够总结才能完成引导任务", () => {
  const activity = getTaskActivity("chinese-20");
  assert.ok(activity);

  const answers = Object.fromEntries(
    activity.questions.map((question, index) => [
      question.id,
      index < activity.minimumCorrectCount
        ? question.answer
        : question.options.find((option) => option !== question.answer)
    ])
  );

  assert.equal(
    canCompleteGuidedTask(activity, answers, "小林主动清理排水口，积水退去，这说明他有责任感。"),
    true
  );
});

test("不存在的任务不会生成虚假内容", () => {
  assert.equal(getTaskActivity("missing-task"), null);
});

test("恢复草稿时只保留当前任务中存在且有效的答案", () => {
  const activity = getTaskActivity("english-20");
  assert.ok(activity);

  const answers = sanitizeGuidedTaskAnswers(activity, {
    "english-q1": "habit",
    "english-q2": "不存在的选项",
    "old-question": "旧题答案"
  });

  assert.deepEqual(answers, { "english-q1": "habit" });
});

test("引导任务只有服务端按真实答案核验完成后才显示保存成功", () => {
  const source = fs.readFileSync(
    new URL("../app/components/guided_task_session.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const taskCompleted = await completeTask\(activity\.taskId, reflection, \{/);
  assert.match(source, /kind: "guided_activity"/);
  assert.match(source, /answers,/);
  assert.match(source, /if \(!taskCompleted\)/);
  assert.match(source, /暂时无法写入今日学习路线/);
});
