import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

const LESSON_PATH = "/interactive-lessons/sims/chapter4-plane-figures.html";

let runtime;

test.before(async () => {
  runtime = await createBrowserLayoutRuntime();
});

test.after(async () => {
  await runtime?.close();
});

test("手机触控可以绘制射线并在系统取消后清理状态", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    await page.locator('.mode-btn[onclick*="ray"]').click();
    const canvas = page.locator("#canvasLines");
    const box = await canvas.boundingBox();
    assert.ok(box, "线的世界画布应可见");

    const pointer = { pointerId: 11, pointerType: "touch", isPrimary: true };
    const start = { x: box.x + 70, y: box.y + 90 };
    const end = { x: box.x + 230, y: box.y + 180 };
    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: start.x, clientY: start.y });
    await canvas.dispatchEvent("pointermove", { ...pointer, buttons: 1, clientX: end.x, clientY: end.y });
    await canvas.dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: end.x, clientY: end.y });

    let state = await page.evaluate(() => ({ count: linesShapes.length, type: linesShapes[0]?.type, dragging: linesDragging }));
    assert.deepEqual(state, { count: 1, type: "ray", dragging: false });

    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: start.x, clientY: start.y });
    await canvas.dispatchEvent("pointercancel", { ...pointer, buttons: 0, clientX: start.x, clientY: start.y });
    state = await page.evaluate(() => ({ dragging: linesDragging, hasStart: Boolean(linesDragStart) }));
    assert.deepEqual(state, { dragging: false, hasStart: false }, "触摸被系统取消后不能残留绘制状态");

    await page.locator('.mode-btn[onclick*="segment"]').click();
    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: start.x, clientY: start.y });
    await canvas.dispatchEvent("pointercancel", { ...pointer, buttons: 0, clientX: start.x, clientY: start.y });
    const pending = await page.evaluate(() => Boolean(linesPending));
    assert.equal(pending, false, "线段第一次触摸被取消后不能留下幽灵端点");
  } finally {
    await page.close();
  }
});

test("手机触控可以拖动角的终边", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    await page.locator('.tab[onclick*="angles"]').click();
    const canvas = page.locator("#canvasAngles");
    const box = await canvas.boundingBox();
    assert.ok(box, "角的世界画布应可见");

    const center = await page.evaluate(() => ({ x: angleW / 2 - 40, y: angleH / 2 + 40 }));
    const target = { x: box.x + center.x - 100, y: box.y + center.y - 100 };
    const pointer = { pointerId: 12, pointerType: "touch", isPrimary: true };
    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: target.x, clientY: target.y });
    await canvas.dispatchEvent("pointermove", { ...pointer, buttons: 1, clientX: target.x - 10, clientY: target.y + 10 });
    await canvas.dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: target.x - 10, clientY: target.y + 10 });

    const state = await page.evaluate(() => ({ angle: angleValue, dragging: angleDragging, text: document.getElementById("angleValueText").textContent }));
    assert.ok(state.angle > 90 && state.angle < 180, `触控后角度应变为钝角，实际 ${state.angle}`);
    assert.equal(state.dragging, false);
    assert.match(state.text, /°$/);
  } finally {
    await page.close();
  }
});
