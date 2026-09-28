import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

const MOBILE_VIEWPORTS = [
  { width: 320, height: 844 },
  { width: 390, height: 844 },
];

const TWO_DIMENSIONAL_LESSONS = [
  ["g7-upper-integers", "numberline"],
  ["g7-upper-algebra", "algebra"],
  ["g7-upper-plane-figures", "plane-figures"],
  ["g7-upper-data", "chart"],
  ["g7-lower-polynomial", "area"],
  ["g7-lower-parallel", "parallel"],
  ["g7-lower-probability", "probability"],
  ["g7-lower-triangle", "triangle"],
  ["g7-lower-symmetry", "symmetry"],
  ["g7-lower-functions", "function"],
  ["g8-math-pythagorean", "pythagorean"],
  ["g8-math-shortest-path", "path"],
  ["g8-math-real-numbers", "real"],
  ["g8-math-coordinate", "coordinate"],
  ["g8-math-transform", "transform"],
  ["g8-math-function", "function-table"],
  ["g8-math-proportion", "proportion"],
  ["g8-math-linear", "linear"],
  ["g8-math-graphs", "graph-review"],
  ["g8-physics-measurement", "measurement"],
  ["g8-physics-motion", "motion"],
  ["g8-physics-error", "error"],
  ["g8-physics-sound", "sound"],
  ["g8-physics-light", "optics"],
  ["g8-physics-wave", "wave"],
  ["g8-physics-force", "force"],
  ["g8-physics-light-review", "optics-review"],
];

const NO_TEXT_OVERLAP_SCENES = new Set([
  "numberline",
  "algebra",
  "triangle",
  "path",
  "error",
  "force",
  "function",
  "function-table",
  "proportion",
  "linear",
  "graph-review",
  "coordinate",
  "transform",
  "measurement",
]);

let runtime;

test.before(async () => {
  runtime = await createBrowserLayoutRuntime();
});

test.after(async () => {
  await runtime?.close();
});

async function installCanvasAudit(page) {
  await page.addInitScript(() => {
    window.__conceptCanvasAudit = { texts: [], roundedRects: [], circles: [], paths: [] };
    const prototype = CanvasRenderingContext2D.prototype;
    const original = {
      beginPath: prototype.beginPath,
      arc: prototype.arc,
      clearRect: prototype.clearRect,
      fill: prototype.fill,
      fillText: prototype.fillText,
      lineTo: prototype.lineTo,
      moveTo: prototype.moveTo,
      roundRect: prototype.roundRect,
      stroke: prototype.stroke,
    };
    let currentPath = [];

    prototype.clearRect = function (...args) {
      if (this.canvas?.id === "sceneCanvas") {
        window.__conceptCanvasAudit = { texts: [], roundedRects: [], circles: [], paths: [] };
      }
      return original.clearRect.apply(this, args);
    };
    prototype.beginPath = function (...args) {
      if (this.canvas?.id === "sceneCanvas") currentPath = [];
      return original.beginPath.apply(this, args);
    };
    prototype.moveTo = function (x, y) {
      if (this.canvas?.id === "sceneCanvas") currentPath.push({ x, y });
      return original.moveTo.call(this, x, y);
    };
    prototype.lineTo = function (x, y) {
      if (this.canvas?.id === "sceneCanvas") currentPath.push({ x, y });
      return original.lineTo.call(this, x, y);
    };
    prototype.arc = function (x, y, radius, startAngle, endAngle, counterclockwise) {
      if (
        this.canvas?.id === "sceneCanvas"
        && Math.abs(Math.abs(endAngle - startAngle) - Math.PI * 2) <= 0.01
      ) {
        window.__conceptCanvasAudit.circles.push({ x, y, radius });
      }
      return original.arc.call(this, x, y, radius, startAngle, endAngle, counterclockwise);
    };
    prototype.roundRect = function (x, y, width, height, radii) {
      if (this.canvas?.id === "sceneCanvas") {
        window.__conceptCanvasAudit.roundedRects.push({ x, y, width, height });
        currentPath.push({ x, y }, { x: x + width, y: y + height });
      }
      return original.roundRect.call(this, x, y, width, height, radii);
    };
    function recordPath(context, operation) {
      if (context.canvas?.id !== "sceneCanvas" || currentPath.length === 0) return;
      const xs = currentPath.map((point) => point.x);
      const ys = currentPath.map((point) => point.y);
      window.__conceptCanvasAudit.paths.push({
        operation,
        strokeStyle: String(context.strokeStyle),
        fillStyle: String(context.fillStyle),
        left: Math.min(...xs),
        right: Math.max(...xs),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      });
    }
    prototype.stroke = function (...args) {
      recordPath(this, "stroke");
      return original.stroke.apply(this, args);
    };
    prototype.fill = function (...args) {
      recordPath(this, "fill");
      return original.fill.apply(this, args);
    };
    prototype.fillText = function (value, x, y, maxWidth) {
      if (this.canvas?.id === "sceneCanvas") {
        const metrics = this.measureText(String(value));
        const fontSize = Number.parseFloat(/([\d.]+)px/.exec(this.font)?.[1] ?? "16");
        const left = x - (Number.isFinite(metrics.actualBoundingBoxLeft)
          ? metrics.actualBoundingBoxLeft
          : this.textAlign === "center" ? metrics.width / 2 : this.textAlign === "right" ? metrics.width : 0);
        const right = x + (Number.isFinite(metrics.actualBoundingBoxRight)
          ? metrics.actualBoundingBoxRight
          : this.textAlign === "center" ? metrics.width / 2 : this.textAlign === "right" ? 0 : metrics.width);
        const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
        const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
        window.__conceptCanvasAudit.texts.push({
          value: String(value),
          x,
          y,
          left,
          right,
          top: y - ascent,
          bottom: y + descent,
        });
      }
      return maxWidth === undefined
        ? original.fillText.call(this, value, x, y)
        : original.fillText.call(this, value, x, y, maxWidth);
    };
  });
}

async function readSceneAudit(page, lessonId) {
  await page.goto(`${runtime.origin}/interactive-lessons/sims/concept-studio.html?lesson=${lessonId}`);
  await page.locator("#sceneCanvas").waitFor();
  await page.waitForFunction(() => (
    window.__conceptCanvasAudit?.texts?.length > 0
    && document.querySelector("#sceneCanvas").width > 0
  ));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const canvas = document.querySelector("#sceneCanvas");
    const rect = canvas.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      texts: window.__conceptCanvasAudit.texts,
      roundedRects: window.__conceptCanvasAudit.roundedRects,
      circles: window.__conceptCanvasAudit.circles,
      paths: window.__conceptCanvasAudit.paths,
    };
  });
}

async function readCurrentSceneAudit(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const canvas = document.querySelector("#sceneCanvas");
    const rect = canvas.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      texts: window.__conceptCanvasAudit.texts,
      roundedRects: window.__conceptCanvasAudit.roundedRects,
      circles: window.__conceptCanvasAudit.circles,
      paths: window.__conceptCanvasAudit.paths,
    };
  });
}

function intersectionArea(first, second) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function findTextOverlaps(texts) {
  const overlaps = [];
  for (let firstIndex = 0; firstIndex < texts.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < texts.length; secondIndex += 1) {
      const first = texts[firstIndex];
      const second = texts[secondIndex];
      if (intersectionArea(first, second) > 1) overlaps.push([first.value, second.value]);
    }
  }
  return overlaps;
}

function findRectOverlaps(rects) {
  const boxes = rects.map((rect) => ({
    left: rect.x,
    right: rect.x + rect.width,
    top: rect.y,
    bottom: rect.y + rect.height,
  }));
  const overlaps = [];
  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      if (intersectionArea(boxes[firstIndex], boxes[secondIndex]) > 1) {
        overlaps.push([firstIndex, secondIndex]);
      }
    }
  }
  return overlaps;
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`全部二维正式课件在 ${viewport.width}px 手机画布内完整显示`, async () => {
    const page = await runtime.browser.newPage({ viewport, reducedMotion: "reduce" });
    await installCanvasAudit(page);
    const failures = [];

    try {
      for (const [lessonId, scene] of TWO_DIMENSIONAL_LESSONS) {
        const audit = await readSceneAudit(page, lessonId);
        const overflowTexts = audit.texts.filter((box) => (
          box.left < -1 || box.right > audit.width + 1 || box.top < -1 || box.bottom > audit.height + 1
        ));
        const overflowRects = audit.roundedRects.filter((box) => (
          box.x < -1 || box.x + box.width > audit.width + 1
          || box.y < -1 || box.y + box.height > audit.height + 1
        ));
        const overflowCircles = audit.circles.filter((circle) => (
          circle.x - circle.radius < -1 || circle.x + circle.radius > audit.width + 1
          || circle.y - circle.radius < -1 || circle.y + circle.radius > audit.height + 1
        ));
        const textOverlaps = NO_TEXT_OVERLAP_SCENES.has(scene)
          ? findTextOverlaps(audit.texts)
          : [];
        const rectOverlaps = scene === "algebra"
          ? findRectOverlaps(audit.roundedRects)
          : [];
        const overflowPythagoreanPaths = scene === "pythagorean"
          ? audit.paths.filter((path) => (
            ["#3185ff", "#20c997", "#ff5b8f", "#7c4dff"].includes(path.strokeStyle)
            && (path.left < -1 || path.right > audit.width + 1 || path.top < -1 || path.bottom > audit.height + 1)
          ))
          : [];

        if (
          overflowTexts.length
          || overflowRects.length
          || overflowCircles.length
          || textOverlaps.length
          || rectOverlaps.length
          || overflowPythagoreanPaths.length
        ) {
          failures.push({
            lessonId,
            scene,
            canvas: { width: audit.width, height: audit.height },
            overflowTexts: overflowTexts.map(({ value, left, right, top, bottom }) => ({ value, left, right, top, bottom })),
            overflowRects,
            overflowCircles,
            textOverlaps,
            rectOverlaps,
            overflowPythagoreanPaths,
          });
        }

        if (scene === "numberline") {
          const tickLabels = audit.texts
            .filter((box) => /^-?\d+$/.test(box.value))
            .sort((first, second) => first.x - second.x);
          const tickOverlaps = tickLabels.slice(1).filter((box, index) => (
            tickLabels[index].right + 2 > box.left
          ));
          if (
            tickLabels.length < 6
            || tickLabels[0]?.value !== "-10"
            || tickLabels.at(-1)?.value !== "10"
            || !tickLabels.some((box) => box.value === "0")
            || tickOverlaps.length
          ) {
            failures.push({ lessonId, scene, issue: "数轴刻度标签不可读", tickLabels });
          }
        }

        if (scene === "force") {
          const forcePaths = audit.paths.filter((path) => (
            path.strokeStyle === "#ff5b8f" || path.strokeStyle === "#20c997"
          ));
          const overflowPaths = forcePaths.filter((path) => (
            path.left < -1 || path.right > audit.width + 1 || path.top < -1 || path.bottom > audit.height + 1
          ));
          if (overflowPaths.length) failures.push({ lessonId, scene, issue: "力的箭头超出画布", overflowPaths });
        }
      }

      const summary = failures.map((failure) => ({
        lessonId: failure.lessonId,
        scene: failure.scene,
        issue: failure.issue,
        overflowTexts: failure.overflowTexts?.map((box) => box.value),
        overflowRectCount: failure.overflowRects?.length,
        overflowCircleCount: failure.overflowCircles?.length,
        textOverlaps: failure.textOverlaps,
        rectOverlaps: failure.rectOverlaps,
        overflowPythagoreanPathCount: failure.overflowPythagoreanPaths?.length,
      }));
      assert.equal(failures.length, 0, `二维课件移动端布局异常：${JSON.stringify(summary)}`);
    } finally {
      await page.close();
    }
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`二维正式课件在 ${viewport.width}px 手机端调到参数边界后仍完整可读`, async () => {
    const page = await runtime.browser.newPage({ viewport, reducedMotion: "reduce" });
    await installCanvasAudit(page);
    const failures = [];

    try {
      for (const [lessonId, scene] of TWO_DIMENSIONAL_LESSONS) {
        await readSceneAudit(page, lessonId);
        for (const boundary of ["min", "max"]) {
          await page.locator('#controls input[type="range"]').evaluateAll((inputs, edge) => {
            for (const input of inputs) {
              input.value = input[edge];
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }, boundary);
          const audit = await readCurrentSceneAudit(page);
          const overflowTexts = audit.texts.filter((box) => (
            box.left < -1 || box.right > audit.width + 1 || box.top < -1 || box.bottom > audit.height + 1
          ));
          const overflowRects = audit.roundedRects.filter((box) => (
            box.x < -1 || box.x + box.width > audit.width + 1
            || box.y < -1 || box.y + box.height > audit.height + 1
          ));
          const overflowCircles = audit.circles.filter((circle) => (
            circle.x - circle.radius < -1 || circle.x + circle.radius > audit.width + 1
            || circle.y - circle.radius < -1 || circle.y + circle.radius > audit.height + 1
          ));
          const textOverlaps = NO_TEXT_OVERLAP_SCENES.has(scene)
            ? findTextOverlaps(audit.texts)
            : [];
          const overflowForcePaths = scene === "force"
            ? audit.paths.filter((path) => (
              (path.strokeStyle === "#ff5b8f" || path.strokeStyle === "#20c997")
              && (path.left < -1 || path.right > audit.width + 1 || path.top < -1 || path.bottom > audit.height + 1)
            ))
            : [];
          const overflowPythagoreanPaths = scene === "pythagorean"
            ? audit.paths.filter((path) => (
              ["#3185ff", "#20c997", "#ff5b8f", "#7c4dff"].includes(path.strokeStyle)
              && (path.left < -1 || path.right > audit.width + 1 || path.top < -1 || path.bottom > audit.height + 1)
            ))
            : [];

          if (
            overflowTexts.length
            || overflowRects.length
            || overflowCircles.length
            || textOverlaps.length
            || overflowForcePaths.length
            || overflowPythagoreanPaths.length
          ) {
            failures.push({
              lessonId,
              scene,
              boundary,
              overflowTexts: overflowTexts.map((box) => box.value),
              overflowRectCount: overflowRects.length,
              overflowCircleCount: overflowCircles.length,
              textOverlaps,
              overflowForcePathCount: overflowForcePaths.length,
              overflowPythagoreanPathCount: overflowPythagoreanPaths.length,
            });
          }
        }
      }

      assert.equal(failures.length, 0, `参数边界布局异常：${JSON.stringify(failures)}`);
    } finally {
      await page.close();
    }
  });
}

for (const viewport of [{ width: 320, height: 844 }, { width: 1366, height: 900 }]) {
  test(`数轴挑战极值在 ${viewport.width}px 画布内仍能完整看到起点、终点和移动`, async () => {
    const page = await runtime.browser.newPage({ viewport, reducedMotion: "reduce" });
    await installCanvasAudit(page);

    try {
      await readSceneAudit(page, "g7-upper-integers");
      await page.locator('#difficultyButtons button[data-id="challenge"]').click();

      for (const [start, move, expectedEnd] of [[8, 8, 16], [-10, -5, -15]]) {
        await page.locator('#controls input[data-key="value"]').evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, start);
        await page.locator('#controls input[data-key="move"]').evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, move);
        const audit = await readCurrentSceneAudit(page);
        const pointCircles = audit.circles.filter((circle) => circle.radius >= 13);
        const overflowCircles = pointCircles.filter((circle) => (
          circle.x - circle.radius < -1 || circle.x + circle.radius > audit.width + 1
        ));
        const endpoint = audit.texts.find((box) => box.value === `终点 ${expectedEnd}`);

        assert.ok(endpoint, `应显示终点 ${expectedEnd}`);
        assert.equal(overflowCircles.length, 0, `起点 ${start}、终点 ${expectedEnd} 都应位于画布内`);
        assert.ok(endpoint.left >= -1 && endpoint.right <= audit.width + 1, `终点 ${expectedEnd} 标签不应被裁切`);
      }
    } finally {
      await page.close();
    }
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`基本平面图形四类实验在 ${viewport.width}px 挑战极值下不裁切`, async () => {
    const page = await runtime.browser.newPage({ viewport, reducedMotion: "reduce" });
    await installCanvasAudit(page);

    try {
      await readSceneAudit(page, "g7-upper-plane-figures");
      await page.locator('#difficultyButtons button[data-id="challenge"]').click();

      for (const moduleId of ["lines", "angles", "polygons", "circles"]) {
        await page.locator(`#shapeModules button[data-plane-module="${moduleId}"]`).click();
        for (const boundary of ["min", "max"]) {
          await page.locator('#controls input[type="range"]').evaluateAll((inputs, edge) => {
            for (const input of inputs) {
              input.value = input[edge];
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }, boundary);
          const audit = await readCurrentSceneAudit(page);
          const overflowTexts = audit.texts.filter((box) => (
            box.left < -1 || box.right > audit.width + 1 || box.top < -1 || box.bottom > audit.height + 1
          ));
          const overflowRects = audit.roundedRects.filter((box) => (
            box.x < -1 || box.x + box.width > audit.width + 1
            || box.y < -1 || box.y + box.height > audit.height + 1
          ));
          const overflowCircles = audit.circles.filter((circle) => (
            circle.x - circle.radius < -1 || circle.x + circle.radius > audit.width + 1
            || circle.y - circle.radius < -1 || circle.y + circle.radius > audit.height + 1
          ));
          const overflowPaths = audit.paths.filter((path) => (
            path.left < -1 || path.right > audit.width + 1 || path.top < -1 || path.bottom > audit.height + 1
          ));

          assert.deepEqual(
            { overflowTexts: overflowTexts.map((box) => box.value), overflowRects, overflowCircles, overflowPaths },
            { overflowTexts: [], overflowRects: [], overflowCircles: [], overflowPaths: [] },
            `${moduleId} 的 ${boundary} 状态应完整位于画布内`,
          );
          assert.deepEqual(findTextOverlaps(audit.texts), [], `${moduleId} 的 ${boundary} 状态文字不应重叠`);
        }
      }
    } finally {
      await page.close();
    }
  });

  test(`轴对称挑战极值在 ${viewport.width}px 画布内仍能看到完整对应点`, async () => {
    const page = await runtime.browser.newPage({ viewport, reducedMotion: "reduce" });
    await installCanvasAudit(page);

    try {
      await readSceneAudit(page, "g7-lower-symmetry");
      await page.locator('#difficultyButtons button[data-id="challenge"]').click();
      const offsetInput = page.locator('#controls input[data-key="offset"]');
      const axisInput = page.locator('#controls input[data-key="axis"]');
      await offsetInput.evaluate((input) => {
        input.value = input.max;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      for (const boundary of ["min", "max"]) {
        await axisInput.evaluate((input, edge) => {
          input.value = input[edge];
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }, boundary);
        const audit = await readCurrentSceneAudit(page);
        const pointCircles = audit.circles.filter((circle) => circle.radius === 18);
        const overflowPoints = pointCircles.filter((circle) => (
          circle.x - circle.radius < -1 || circle.x + circle.radius > audit.width + 1
        ));
        assert.equal(pointCircles.length, 2, "应绘制一对轴对称点");
        assert.equal(overflowPoints.length, 0, `对称轴位于 ${boundary} 时两个点都不应被裁切`);
      }
    } finally {
      await page.close();
    }
  });
}

for (const cancellationEvent of ["pointercancel", "lostpointercapture"]) {
  test(`二维实验收到 ${cancellationEvent} 后停止继续拖动`, async () => {
    const page = await runtime.browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });

    try {
      await page.goto(`${runtime.origin}/interactive-lessons/sims/concept-studio.html?lesson=g7-upper-integers`);
      const canvas = page.locator("#sceneCanvas");
      const box = await canvas.boundingBox();
      assert.ok(box, "数轴画布应可见");

      await canvas.dispatchEvent("pointerdown", {
        pointerId: 99,
        pointerType: "touch",
        clientX: box.x + box.width * 0.25,
        clientY: box.y + box.height * 0.56,
      });
      const valueAfterPress = await page.locator(".control-output").first().textContent();

      await canvas.dispatchEvent(cancellationEvent, { pointerId: 99, pointerType: "touch" });
      await canvas.dispatchEvent("pointermove", {
        pointerId: 99,
        pointerType: "touch",
        clientX: box.x + box.width * 0.75,
        clientY: box.y + box.height * 0.56,
      });
      const valueAfterMove = await page.locator(".control-output").first().textContent();

      assert.equal(
        valueAfterMove,
        valueAfterPress,
        `${cancellationEvent} 后没有再次按下时，移动指针不应继续修改数轴值`,
      );
    } finally {
      await page.close();
    }
  });
}

test("扩展数轴上按住已有起点不会让数值跳变", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  await installCanvasAudit(page);
  try {
    await readSceneAudit(page, "g7-upper-integers");
    await page.locator('#difficultyButtons button[data-id="challenge"]').click();
    await page.evaluate(() => { window.__conceptCanvasAudit = { texts: [], roundedRects: [], circles: [], paths: [] }; });
    for (const [key, value] of [["value", 8], ["move", 8]]) {
      await page.locator(`#controls input[data-key="${key}"]`).evaluate((input, nextValue) => {
        input.value = String(nextValue);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    const audit = await readCurrentSceneAudit(page);
    const start = audit.circles.find((circle) => circle.radius === 13);
    await page.locator("#sceneCanvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#sceneCanvas").boundingBox();
    assert.ok(start && box, "应能定位数轴起点手柄");
    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.locator('#controls input[data-key="value"]').inputValue(), "8");
  } finally {
    await page.close();
  }
});

test("紧凑圆模块按绘图圆心换算触控角度", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  await installCanvasAudit(page);
  try {
    await readSceneAudit(page, "g7-upper-plane-figures");
    await page.locator('#difficultyButtons button[data-id="challenge"]').click();
    await page.locator('#shapeModules button[data-plane-module="circles"]').click();
    await page.evaluate(() => { window.__conceptCanvasAudit = { texts: [], roundedRects: [], circles: [], paths: [] }; });
    await page.locator("#planeSectorRange").evaluate((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
    const audit = await readCurrentSceneAudit(page);
    const center = audit.circles.find((circle) => circle.radius === 11);
    await page.locator("#sceneCanvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#sceneCanvas").boundingBox();
    assert.ok(center && box, "应能定位圆心");
    const target = { x: box.x + center.x + 45, y: box.y + center.y };
    await page.mouse.move(target.x, target.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.locator("#planeSectorRange").inputValue(), "90");
  } finally {
    await page.close();
  }
});

test("偏移对称轴后按住已有对应点不会让距离跳变", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" });
  await installCanvasAudit(page);
  try {
    await readSceneAudit(page, "g7-lower-symmetry");
    await page.locator('#difficultyButtons button[data-id="challenge"]').click();
    for (const [key, value] of [["axis", 30], ["offset", 3]]) {
      await page.locator(`#controls input[data-key="${key}"]`).evaluate((input, nextValue) => {
        input.value = String(nextValue);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    await page.evaluate(() => { window.__conceptCanvasAudit = { texts: [], roundedRects: [], circles: [], paths: [] }; });
    await page.locator('#controls input[data-key="offset"]').evaluate((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
    const audit = await readCurrentSceneAudit(page);
    const points = audit.circles.filter((circle) => circle.radius === 18);
    const point = points.sort((a, b) => b.x - a.x)[0];
    await page.locator("#sceneCanvas").scrollIntoViewIfNeeded();
    const box = await page.locator("#sceneCanvas").boundingBox();
    assert.ok(point && box, "应能定位轴对称对应点");
    await page.mouse.move(box.x + point.x, box.y + point.y);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.locator('#controls input[data-key="offset"]').inputValue(), "3");
  } finally {
    await page.close();
  }
});
