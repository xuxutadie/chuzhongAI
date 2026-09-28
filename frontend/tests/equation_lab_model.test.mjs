import assert from "node:assert/strict";
import test from "node:test";

await import("../public/interactive-lessons/sims/equation-lab-model.js");
const model = globalThis.EquationLabModel;

test("三级难度对应不同结构的一元一次方程", () => {
  const basic = model.createState("basic");
  const advanced = model.createState("advanced");
  const challenge = model.createState("challenge");
  assert.equal(basic.originalExpression, "x + 3 = 7");
  assert.equal(advanced.originalExpression, "2x + 3 = 11");
  assert.equal(challenge.expanded, false);
  assert.equal(challenge.solution, 5);
});

test("等式两边加减同一个数保持平衡", () => {
  const state = model.createState("basic");
  const next = model.applyAction(state, { type: "add", value: -3 }, "both");
  assert.equal(next.a, 1);
  assert.equal(next.b, 0);
  assert.equal(next.c, 4);
  assert.equal(next.balanced, true);
  assert.equal(next.solved, true);
});

test("只操作等式一边会破坏平衡但不污染正式解题状态", () => {
  const state = model.createState("basic");
  const experiment = model.applyAction(state, { type: "add", value: -3 }, "left");
  assert.equal(experiment.balanced, false);
  assert.equal(experiment.a, 1);
  assert.equal(experiment.b, 3);
  assert.equal(experiment.c, 7);
  assert.equal(experiment.invalidExperiment.scope, "left");
});

test("进阶方程需要先消去常数项再把系数化为 1", () => {
  let state = model.createState("advanced");
  assert.deepEqual(model.getSuggestedAction(state), { type: "add", value: -3 });
  state = model.applyAction(state, { type: "add", value: -3 }, "both");
  assert.deepEqual(model.getSuggestedAction(state), { type: "divide", value: 2 });
  state = model.applyAction(state, { type: "divide", value: 2 }, "both");
  assert.equal(state.solved, true);
  assert.equal(state.c, 4);
});

test("挑战方程先展开括号再继续求解", () => {
  let state = model.createState("challenge");
  assert.deepEqual(model.getSuggestedAction(state), { type: "expand" });
  state = model.applyAction(state, { type: "expand" }, "both");
  assert.equal(model.formatEquation(state), "3x - 6 + 4 = 13");
  assert.deepEqual(model.getSuggestedAction(state), { type: "combine" });
  state = model.applyAction(state, { type: "combine" }, "both");
  assert.equal(state.expanded, true);
  assert.equal(model.formatEquation(state), "3x - 2 = 13");
  state = model.applyAction(state, { type: "add", value: 2 }, "both");
  state = model.applyAction(state, { type: "divide", value: 3 }, "both");
  assert.equal(state.solved, true);
  assert.equal(state.c, 5);
});

test("挑战题原式视觉状态保留三组括号和独立的加四", () => {
  const state = model.createState("challenge");
  const visual = model.getVisualState(state);
  assert.equal(visual.mode, "algebra");
  assert.equal(visual.phase, "grouped");
  assert.equal(visual.left.groups.length, 3);
  assert.deepEqual(visual.left.groups[0], { variables: 1, negativeUnits: 2 });
  assert.equal(visual.left.loosePositiveUnits, 4);
  assert.equal(visual.right.positiveUnits, 13);
});

test("挑战题展开后仍保留正四，合并后才消去四组零对", () => {
  let state = model.createState("challenge");
  state = model.applyAction(state, { type: "expand" }, "both");
  let visual = model.getVisualState(state);
  assert.equal(visual.phase, "expanded");
  assert.equal(visual.left.variables, 3);
  assert.equal(visual.left.negativeUnits, 6);
  assert.equal(visual.left.positiveUnits, 4);

  state = model.applyAction(state, { type: "combine" }, "both");
  visual = model.getVisualState(state);
  assert.equal(visual.phase, "combined");
  assert.equal(visual.left.variables, 3);
  assert.equal(visual.left.negativeUnits, 2);
  assert.equal(visual.left.positiveUnits, 0);
  assert.equal(visual.cancelledZeroPairs, 4);

  state = model.applyAction(state, { type: "add", value: 2 }, "both");
  visual = model.getVisualState(state);
  assert.equal(model.formatEquation(state), "3x = 15");
  assert.equal(visual.left.negativeUnits, 0);
  assert.equal(visual.right.positiveUnits, 15);
});

test("基础与进阶题使用真实天平模式且不生成负质量砝码", () => {
  const basic = model.getVisualState(model.createState("basic"));
  const advanced = model.getVisualState(model.createState("advanced"));
  assert.equal(basic.mode, "balance");
  assert.equal(advanced.mode, "balance");
  assert.equal(basic.left.negativeUnits, 0);
  assert.equal(advanced.left.negativeUnits, 0);
});

test("代回原方程才能完成验证", () => {
  let state = model.createState("advanced");
  state = model.applyAction(state, { type: "add", value: -3 }, "both");
  state = model.applyAction(state, { type: "divide", value: 2 }, "both");
  assert.equal(model.verifySolution(state, 3).correct, false);
  const result = model.verifySolution(state, 4);
  assert.equal(result.correct, true);
  assert.equal(result.leftValue, result.rightValue);
});
