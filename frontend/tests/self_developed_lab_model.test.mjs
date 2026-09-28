import assert from "node:assert/strict";
import test from "node:test";

await import("../public/interactive-lessons/sims/self-developed-lab-model.js");
const model = globalThis.SelfDevelopedLabModel;

const lessonIds = [
  "g7-upper-shapes",
  "g7-upper-integers",
  "g7-upper-algebra",
  "g7-upper-plane-figures",
  "g7-upper-equations",
  "g7-upper-data",
  "g7-lower-polynomial",
  "g7-lower-parallel",
  "g7-lower-probability",
  "g7-lower-triangle",
  "g7-lower-symmetry",
  "g7-lower-functions",
  "g8-math-pythagorean",
  "g8-math-shortest-path",
  "g8-math-real-numbers",
  "g8-math-coordinate",
  "g8-math-transform",
  "g8-math-function",
  "g8-math-proportion",
  "g8-math-linear",
  "g8-math-graphs",
  "g8-physics-measurement",
  "g8-physics-motion",
  "g8-physics-error",
  "g8-physics-sound",
  "g8-physics-light",
  "g8-physics-wave",
  "g8-physics-force",
  "g8-physics-light-review"
];

test("全部互动课题都由统一自研引擎覆盖", () => {
  assert.deepEqual(Object.keys(model.lessons).sort(), lessonIds.sort());
  for (const lesson of Object.values(model.lessons)) {
    assert.ok(lesson.title);
    assert.ok(lesson.scene);
    assert.equal(lesson.levels.length, 3);
    assert.ok(lesson.challenge.question);
  }
});

test("三级难度按基础、进阶、挑战排列", () => {
  assert.deepEqual(model.difficulties.map((item) => item.id), ["basic", "advanced", "challenge"]);
  assert.ok(model.getDifficulty("missing").id === "basic");
});

test("难度参数会改变实验范围和任务要求", () => {
  const basic = model.createSession("g8-math-linear", "basic");
  const challenge = model.createSession("g8-math-linear", "challenge");
  assert.equal(basic.lessonId, "g8-math-linear");
  assert.ok(challenge.range > basic.range);
  assert.ok(challenge.controls[0].max - challenge.controls[0].min > basic.controls[0].max - basic.controls[0].min);
  assert.notEqual(challenge.prompt, basic.prompt);
});

test("未知课题安全回退到首个自研课题", () => {
  const session = model.createSession("not-found", "basic");
  assert.equal(session.lessonId, "g7-upper-shapes");
});
