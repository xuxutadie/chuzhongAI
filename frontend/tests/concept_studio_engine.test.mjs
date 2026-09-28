import assert from "node:assert/strict";
import test from "node:test";

await import("../public/interactive-lessons/sims/concept-studio-engine.js");
const engine = globalThis.ConceptStudioEngine;

test("数轴移动结果与方向一致", () => {
  assert.deepEqual(engine.derive("numberline", { value: -2, move: 3 }), { start: -2, move: 3, end: 1 });
});

test("勾股模型按平方和计算斜边", () => {
  const result = engine.derive("pythagorean", { a: 3, b: 4 });
  assert.equal(result.c, 5);
  assert.equal(result.leftArea, 9);
  assert.equal(result.rightArea, 16);
  assert.equal(result.hypotenuseArea, 25);
});

test("一次函数参数与取值表一致", () => {
  const result = engine.derive("function", { k: -2, b: 3 });
  assert.deepEqual(result.points.find((point) => point.x === 2), { x: 2, y: -1 });
  assert.equal(result.expression, "y=-2x+3");
});

test("运动和受力模型采用正确物理关系", () => {
  assert.equal(engine.derive("motion", { speed: 5, time: 6 }).distance, 30);
  assert.equal(engine.derive("force", { force: 12, friction: 5 }).netForce, 7);
});

test("折射模型遵守斯涅尔定律且不会产生非法角度", () => {
  const result = engine.derive("optics", { angle: 30, index: 1.5 });
  assert.ok(Math.abs(result.refractionAngle - 19.47) < 0.02);
  assert.ok(result.refractionAngle >= 0 && result.refractionAngle <= 90);
});

test("测量和误差结果保留可解释的数值", () => {
  assert.equal(engine.derive("measurement", { value: 63, scale: 2 }).reading, 63);
  const error = engine.derive("error", { trueValue: 60, error: 2 });
  assert.equal(error.measuredValue, 62);
  assert.equal(error.absoluteError, 2);
  assert.ok(Math.abs(error.relativeError - 3.33) < 0.01);
});

test("面积、三角形和概率模型给出正确结果", () => {
  assert.deepEqual(engine.derive("area", { a: 4, b: 3 }), { area: 12, perimeter: 14 });
  const triangle = engine.derive("triangle", { a: 7, height: 6 });
  assert.equal(triangle.area, 21);
  assert.equal(triangle.angleSum, 180);
  assert.equal(engine.derive("probability", { trials: 50, chance: 50 }).expected, 25);
});

test("实数、坐标、平移和波动模型边界正确", () => {
  assert.deepEqual(engine.derive("real", { radicand: 8, precision: 2 }), { value: 2.83, lower: 2, upper: 3 });
  assert.equal(engine.derive("coordinate", { x: -3, y: 4 }).quadrant, "第二象限");
  assert.equal(engine.derive("coordinate", { x: 0, y: 4 }).quadrant, "坐标轴上");
  assert.equal(engine.derive("transform", { dx: 3, dy: -2 }).rule, "(x, y) → (x+3, y-2)");
  assert.equal(engine.derive("wave", { amplitude: 4, frequency: 2 }).wavelength, 4);
});

test("立方体截面由真实棱交点生成", () => {
  const center = engine.derive("shapes", { turn: 30, slice: 50 });
  assert.equal(center.vertexCount, 6);
  assert.equal(center.shape, "六边形");

  const nearVertex = engine.derive("shapes", { turn: 30, slice: 15 });
  assert.equal(nearVertex.vertexCount, 3);
  assert.equal(nearVertex.shape, "三角形");

  for (const point of [...center.vertices, ...nearVertex.vertices]) {
    assert.ok(point.every((value) => value >= -1.000001 && value <= 1.000001));
    assert.ok(point.some((value) => Math.abs(Math.abs(value) - 1) < 0.000001));
  }
  for (const point of center.vertices) {
    assert.ok(Math.abs(point[0] + point[1] + point[2]) < 0.000001);
  }
});
