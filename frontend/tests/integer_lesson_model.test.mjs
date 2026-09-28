import assert from "node:assert/strict";
import test from "node:test";

await import("../public/interactive-lessons/sims/chapter2-integers-model.js");
const model = globalThis.IntegerLessonModel;

test("数轴拖动值始终限制在 -10 到 10", () => {
  assert.equal(model.clampNumber(-15), -10);
  assert.equal(model.clampNumber(4), 4);
  assert.equal(model.clampNumber(18), 10);
});

test("相反数关于原点对称且绝对值表示到原点的距离", () => {
  assert.equal(model.getOpposite(-6), 6);
  assert.equal(model.getOpposite(0), 0);
  assert.equal(model.getAbsoluteDistance(-6), 6);
});

test("有理数加减在数轴上转换为正确的终点", () => {
  assert.equal(model.calculateMove(2, "add", -5), -3);
  assert.equal(model.calculateMove(-3, "subtract", -4), 1);
});

test("四步挑战只接受各自的正确答案", () => {
  assert.equal(model.checkChallenge("number-line", "-2"), true);
  assert.equal(model.checkChallenge("opposite", "5"), true);
  assert.equal(model.checkChallenge("absolute", "7"), true);
  assert.equal(model.checkChallenge("operation", "-3"), true);
  assert.equal(model.checkChallenge("operation", "3"), false);
});

test("步骤按顺序解锁，全部完成后仍可回看所有步骤", () => {
  assert.equal(model.getUnlockedStepIndex([false, false, false, false]), 0);
  assert.equal(model.getUnlockedStepIndex([true, false, false, false]), 1);
  assert.equal(model.getUnlockedStepIndex([true, true, true, true]), 3);
});
