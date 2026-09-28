import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { isMathInteractionResultMessage } from "../app/interactive-lesson-message.ts";

const appOrigin = "http://127.0.0.1:3002";
const validMessage = {
  type: "math-interaction-result",
  lessonId: "g7-upper-shapes",
  knowledgePointId: "g7u-shapes-folding",
  section: "fold",
  difficulty: "advanced",
  challengeId: "fold-advanced-challenge",
  passed: true,
  attempts: 2,
};

test("只接受同源且知识点匹配的数学互动结果", () => {
  assert.equal(
    isMathInteractionResultMessage(
      appOrigin,
      appOrigin,
      validMessage,
      "g7u-shapes-folding",
    ),
    true,
  );
});

test("拒绝错误来源、知识点和不完整字段", () => {
  assert.equal(
    isMathInteractionResultMessage("https://example.com", appOrigin, validMessage, "g7u-shapes-folding"),
    false,
  );
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, validMessage, "g7u-shapes-solid"),
    false,
  );
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, { ...validMessage, challengeId: "" }, "g7u-shapes-folding"),
    false,
  );
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, { ...validMessage, passed: "yes" }, "g7u-shapes-folding"),
    false,
  );
});

test("拒绝未知场景、难度和不匹配的场景知识点组合", () => {
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, { ...validMessage, section: "unknown" }, "g7u-shapes-folding"),
    false,
  );
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, { ...validMessage, difficulty: "expert" }, "g7u-shapes-folding"),
    false,
  );
  assert.equal(
    isMathInteractionResultMessage(appOrigin, appOrigin, { ...validMessage, section: "cut" }, "g7u-shapes-folding"),
    false,
  );
});

test("第一章课件读取白名单参数并发送新旧两种完成事件", () => {
  const source = fs.readFileSync(
    new URL("../public/interactive-lessons/sims/chapter1-shapes-world.html", import.meta.url),
    "utf8",
  );
  assert.match(source, /URLSearchParams\(window\.location\.search\)/);
  assert.match(source, /allowedSections\.includes/);
  assert.match(source, /allowedDifficulties\.includes/);
  assert.match(source, /type:\s*'math-interaction-result'/);
  assert.match(source, /type:\s*'interactive-lesson-complete'/);
});

test("第一章八道互动题都有对应的课件挑战", async () => {
  const source = fs.readFileSync(
    new URL("../public/interactive-lessons/sims/chapter1-shapes-world.html", import.meta.url),
    "utf8",
  );
  const { chapter1ShapePackages } = await import(
    new URL("../app/math-learning/chapter1-shapes-pack.ts", import.meta.url).href
  );
  const interactiveQuestions = chapter1ShapePackages.flatMap((pack) =>
    pack.questions.filter((question) => question.responseType === "interactive")
  );
  assert.equal(interactiveQuestions.length, 8);
  for (const question of interactiveQuestions) {
    assert.equal(
      source.includes(`'${question.correctAnswer.challengeId}'`),
      true,
      `课件缺少互动挑战：${question.correctAnswer.challengeId}`,
    );
  }
  assert.match(source, /'solid-cube-parts':[\s\S]*?shape:\s*'cube'/);
  assert.match(source, /'solid-cylinder-surfaces':[\s\S]*?shape:\s*'cylinder'/);
  assert.match(source, /selectShape\(initialShape, true\)/);
  assert.match(source, /id="shapesTaskNote"/);
  assert.match(source, /if \(!stepInteractions\[step\.id\]\)/);
  assert.match(source, /controls\.addEventListener\('start'/);
});

test("测试题嵌入模式锁定当前场景且隐藏整章导航", () => {
  const source = fs.readFileSync(
    new URL("../public/interactive-lessons/sims/chapter1-shapes-world.html", import.meta.url),
    "utf8",
  );
  assert.match(source, /const isEmbeddedQuestion = lessonParams\.get\('embedded'\) === 'question'/);
  assert.match(source, /const lockedSection = isEmbeddedQuestion \? currentSection : null/);
  assert.match(source, /if \(isEmbeddedQuestion && id !== lockedSection\) return/);
  assert.match(source, /document\.body\.classList\.toggle\('embedded-question', isEmbeddedQuestion\)/);
  assert.match(source, /body\.embedded-question \.tabs \{ display: none; \}/);
  assert.match(source, /body\.embedded-question \.shape-grid \{ display: none; \}/);
  assert.match(source, /if \(lockedShape && type !== lockedShape\) return/);
  assert.match(source, /next\.hidden = isEmbeddedQuestion/);
});
