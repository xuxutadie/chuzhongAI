import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const componentUrl = new URL("../app/components/math_learning_workspace.tsx", import.meta.url);
const questionUrl = new URL("../app/components/math_question_renderer.tsx", import.meta.url);
const interactionUrl = new URL("../app/components/math_interaction_question.tsx", import.meta.url);
const pageUrl = new URL("../app/today-learning/page.tsx", import.meta.url);
const lessonUrl = new URL("../public/interactive-lessons/sims/chapter1-shapes-world.html", import.meta.url);
const globalsUrl = new URL("../app/globals.css", import.meta.url);

test("过关记录保存失败后提供显式重试入口，不要求学生重做题目", () => {
  const source = fs.readFileSync(componentUrl, "utf8");
  assert.match(source, /重新保存学习结果/);
  assert.match(source, /completionRetry/);
  assert.match(source, /setCompletionRetry\(.*current.*current \+ 1/);
});

test("错题讲解保留全部原选项，解析中的选项编号可以对应原题", () => {
  const source = fs.readFileSync(new URL("../app/components/math_text_study.tsx", import.meta.url), "utf8");
  assert.match(source, /question\.options\?\.map/);
  assert.match(source, /option\.id\.toUpperCase\(\)/);
  assert.match(source, /option\.text/);
});

test("今日学习页面提供完整五步流程且一次只显示当前主阶段", () => {
  const source = fs.readFileSync(componentUrl, "utf8");
  for (const label of ["选择内容", "首次测试", "查看诊断", "针对学习", "过关测试"]) {
    assert.equal(source.includes(label), true, `缺少流程步骤：${label}`);
  }
  assert.match(source, /data-learning-phase=/);
  assert.match(source, /renderCurrentPhase\(\)/);
});

test("题目渲染器覆盖单选、判断、多选和互动四种作答方式", () => {
  const source = fs.readFileSync(questionUrl, "utf8");
  for (const type of ["single-choice", "true-false", "multi-choice", "interactive"]) {
    assert.equal(source.includes(type), true, `缺少作答方式：${type}`);
  }
});

test("互动题使用现有第一章课件并校验同源完成消息", () => {
  const source = fs.readFileSync(interactionUrl, "utf8");
  const rendererSource = fs.readFileSync(questionUrl, "utf8");
  assert.match(source, /chapter1-shapes-world\.html/);
  assert.match(source, /isMathInteractionResultMessage/);
  assert.match(source, /重新加载图形/);
  assert.match(source, /更换备用题/);
  assert.match(rendererSource, /key=\{question\.id\}/);
});

test("针对学习的互动图形失败时先进入文字讲解，不会直接算作完成", () => {
  const source = fs.readFileSync(componentUrl, "utf8");
  assert.match(source, /setTargetedFallback\(true\)/);
  assert.match(source, /改用文字讲解/);
  assert.match(source, /我已看懂这些关键点/);
  assert.doesNotMatch(source, /onUnavailable=\{\(\) => setTargetedLearningDone\(true\)\}/);
});

test("今日学习沿用学生框架，首页路线有五步而不是单项旧任务", async () => {
  const source = fs.readFileSync(pageUrl, "utf8");
  assert.match(source, /StudentPageShell/);
  assert.match(source, /showPageHero=\{false\}/);
  const { routeCards } = await import('../app/learning-route/model.js');
  const steps = routeCards({ current_step: 1, steps: [], started: false });
  assert.equal(steps.length, 5);
  assert.equal(steps.filter(step => !step.disabled).length, 1);
});

test("数学通关会写回服务端稳定任务，并只使用该任务冻结的课程快照", () => {
  const source = fs.readFileSync(componentUrl, "utf8");

  assert.match(source, /useLearningProgress/);
  assert.match(source, /DAILY_MATH_TASK_ID/);
  assert.match(source, /tasks\.find\(\(task\) => task\.id === DAILY_MATH_TASK_ID\)/);
  assert.match(source, /completeTask\(\s*mathTaskId/);
  assert.match(source, /mathTaskAvailability === "in_progress"/);
  assert.match(source, /buildMathCompletionAttempts\(session\)/);
  assert.match(source, /taskCourseContext\.knowledgePoints/);
  assert.match(source, /allowedKnowledgePointIds\.has/);
});

test("数学任务只有在服务端确认开始后才进入诊断", () => {
  const source = fs.readFileSync(componentUrl, "utf8");

  assert.match(source, /const started = await startTask\(mathTaskId\)/);
  assert.match(source, /服务端未确认这项诊断已经开始/);
  assert.match(source, /async function startLearning\(\)[\s\S]*?const started = await confirmMathTaskStart\(\)[\s\S]*?setSession\(createSession/s);
  assert.doesNotMatch(source, /void startTask\(mathTaskId\)/);
});

test("新学生先看到真实课程选择，迁移前任务与已完成任务不会被错误重开", () => {
  const source = fs.readFileSync(componentUrl, "utf8");

  assert.match(source, /courseContextRequired/);
  assert.match(source, /<CourseContextSelector required \/>/);
  assert.match(source, /isLegacyMathTask/);
  assert.match(source, /历史任务兼容模式/);
  assert.match(source, /mathTaskAvailability === "completed"/);
  assert.match(source, /这份数学诊断已经记入今日路线/);
});

test("互动图形的网络错误、内部运行错误和超时都有文字替代路径", () => {
  const interactionSource = fs.readFileSync(interactionUrl, "utf8");
  const lessonSource = fs.readFileSync(lessonUrl, "utf8");

  assert.match(interactionSource, /onError=\{handleError\}/);
  assert.match(interactionSource, /math-interaction-runtime-error/);
  assert.match(interactionSource, /loadState === "error"/);
  assert.match(lessonSource, /math-interaction-runtime-error/);
});

test("数学学习区不会在学生主内容区内嵌套 main landmark", () => {
  const source = fs.readFileSync(componentUrl, "utf8");

  assert.match(source, /<section className="math-phase-stage" aria-label="当前学习步骤">/);
  assert.doesNotMatch(source, /<main className="math-phase-stage">/);
});

test("单选题可用方向键切换，同时保留原生确认按键的 button 语义", () => {
  const source = fs.readFileSync(questionUrl, "utf8");

  assert.match(source, /handleSingleChoiceKeyDown/);
  assert.match(source, /"ArrowRight"/);
  assert.match(source, /"ArrowLeft"/);
  assert.match(source, /onKeyDown=\{\(event\) => handleSingleChoiceKeyDown\(event, index\)\}/);
  assert.match(source, /singleChoiceOptionRefs\.current\[nextIndex\]\?\.focus\(\)/);
  assert.match(source, /type="button"/);
  assert.match(source, /role="radio"/);
});

test("系统偏好减少动态效果时关闭页面平滑滚动", () => {
  const source = fs.readFileSync(globalsUrl, "utf8");

  assert.match(
    source,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?html\s*\{[\s\S]*?scroll-behavior:\s*auto/,
  );
});
