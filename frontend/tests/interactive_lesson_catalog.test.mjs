import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../public/interactive-lessons/sims/self-developed-lab-model.js");
const model = globalThis.SelfDevelopedLabModel;
const catalogSource = fs.readFileSync(new URL("../app/interactive-lessons/lesson-catalog.ts", import.meta.url), "utf8");
const playerSource = fs.readFileSync(new URL("../app/components/interactive_lesson_player.tsx", import.meta.url), "utf8");
const { resolveLocalLessonRoute } = await import("../app/interactive-lessons/lesson-catalog.ts");

test("互动课程目录不再包含外部模拟或暂缺状态", () => {
  const forbidden = ["phetId", "getPhetUrl", "暂缺", "官方模拟"];
  for (const keyword of forbidden) {
    assert.equal(catalogSource.includes(keyword), false);
    assert.equal(playerSource.includes(keyword), false);
  }
});

test("目录中的全部课题编号都存在于自研引擎", () => {
  const ids = [...catalogSource.matchAll(/(?:localLesson|preparedLesson|preparedLessonWithSemester)\("([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual([...new Set(ids)].sort(), Object.keys(model.lessons).sort());
});

test("播放器只加载系统内部课件", () => {
  assert.equal(playerSource.includes("<iframe"), true);
  assert.equal(playerSource.includes("window.open"), false);
  assert.equal(playerSource.includes("target=\"_blank\""), false);
});

test("一元一次方程使用独立深度互动课件", () => {
  assert.equal(catalogSource.includes('"g7-upper-equations": "/interactive-lessons/sims/equation-lab.html"'), true);
  assert.equal(catalogSource.includes('"/interactive-lessons/sims/equation-lab.html"'), true);
});

test("带有 html 资源的数学课程使用原有专用互动课件", () => {
  assert.equal(
    resolveLocalLessonRoute("g7-upper-shapes", "chapter1-shapes-world.html"),
    "/interactive-lessons/sims/chapter1-shapes-world.html"
  );
  assert.equal(
    resolveLocalLessonRoute("g7-upper-integers", "chapter2-integers.html"),
    "/interactive-lessons/sims/chapter2-integers.html"
  );
});

test("独立互动课不再错误承诺会解锁今日下一项任务", () => {
  const source = fs.readFileSync(
    new URL("../app/components/interactive_lesson_player.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /成长值 \+40，下一项已经解锁/);
  assert.match(source, /今日任务仍需在任务页完成答案核验/);
  assert.match(source, /独立学习内容已保存/);
});

test("独立互动课不会伪装成已核验的今日任务", () => {
  const source = fs.readFileSync(
    new URL("../app/components/interactive_lesson_player.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(linkedTask\)/);
  assert.match(source, /不能替代今日任务的答案核验/);
  assert.doesNotMatch(source, /completeTask\(linkedTask\.id/);
});

test("统一互动类型继续使用通用互动工作室", () => {
  assert.equal(
    resolveLocalLessonRoute("g7-lower-functions", "unified-function"),
    "/interactive-lessons/sims/concept-studio.html?lesson=g7-lower-functions"
  );
});
