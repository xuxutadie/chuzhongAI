import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

let runtime;

test.before(async () => {
  runtime = await createBrowserLayoutRuntime();
});

test.after(async () => {
  await runtime?.close();
});

test("平行线课件嵌入手机页面时使用两列紧凑标签", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    const source = encodeURIComponent("/interactive-lessons/sims/chapter7-2-parallel-lines.html");
    await page.goto(`${runtime.origin}/embedded-lesson-harness?src=${source}`);
    const frame = page.frames().find((candidate) => (
      candidate.parentFrame()
      && candidate.url().includes("chapter7-2-parallel-lines.html")
    ));
    assert.ok(frame, "测试页应加载真实的相交线与平行线课件");
    await frame.waitForLoadState("domcontentloaded");
    await frame.locator(".tab-btn").first().evaluate((button) => (
      Promise.all(button.getAnimations().map((animation) => animation.finished))
    ));

    const layout = await frame.evaluate(() => {
      const buttons = [...document.querySelectorAll(".tab-btn")];
      const header = document.querySelector(".header");
      const buttonRects = buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const style = getComputedStyle(button);
        return {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          paddingTop: Number.parseFloat(style.paddingTop),
        };
      });
      const rows = [...new Set(buttonRects.map((rect) => rect.top))];
      const columns = [...new Set(buttonRects.map((rect) => rect.left))];
      return {
        embedded: document.body.classList.contains("embedded"),
        headerDisplay: header ? getComputedStyle(header).display : null,
        buttonCount: buttons.length,
        rows,
        columns,
        buttonRects,
        hasHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });

    assert.equal(layout.buttonCount, 4, `课件应渲染四个标签按钮：${JSON.stringify(layout)}`);
    assert.equal(layout.embedded, true, `iframe 内应启用嵌入模式：${JSON.stringify(layout)}`);
    assert.equal(layout.headerDisplay, "none");
    assert.equal(layout.rows.length, 2, `手机端标签应为两行：${JSON.stringify(layout)}`);
    assert.equal(layout.columns.length, 2, `手机端标签应为两列：${JSON.stringify(layout)}`);
    assert.ok(
      layout.buttonRects.every((rect) => rect.paddingTop <= 8),
      `嵌入模式应压缩标签内边距：${JSON.stringify(layout.buttonRects)}`,
    );
    assert.equal(layout.hasHorizontalOverflow, false);
  } finally {
    await page.close();
  }
});

test("图形实验室在手机端为说明卡预留空间且不遮挡画布", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/concept-studio.html?lesson=g7-upper-shapes`);
    await page.locator("#shapeOverlay:not([hidden])").waitFor();
    await page.waitForFunction(() => (
      [...document.querySelectorAll(".canvas-shell canvas")]
        .some((canvas) => getComputedStyle(canvas).display !== "none" && canvas.getBoundingClientRect().height > 0)
    ));

    const boxes = await page.evaluate(() => {
      const shell = document.querySelector(".canvas-shell").getBoundingClientRect();
      const overlay = document.querySelector("#shapeOverlay").getBoundingClientRect();
      const canvas = [...document.querySelectorAll(".canvas-shell canvas")]
        .find((candidate) => getComputedStyle(candidate).display !== "none")
        .getBoundingClientRect();
      return {
        shell: { top: shell.top, bottom: shell.bottom, height: shell.height },
        overlay: { top: overlay.top, bottom: overlay.bottom, height: overlay.height },
        canvas: { top: canvas.top, bottom: canvas.bottom, height: canvas.height },
      };
    });
    const overlapsVertically = !(
      boxes.overlay.bottom <= boxes.canvas.top
      || boxes.canvas.bottom <= boxes.overlay.top
    );

    assert.equal(
      overlapsVertically,
      false,
      `手机端说明卡不应盖住画布：${JSON.stringify(boxes)}`,
    );
    assert.ok(
      boxes.shell.height >= boxes.overlay.height + boxes.canvas.height,
      `容器应同时容纳说明卡和画布：${JSON.stringify(boxes)}`,
    );
  } finally {
    await page.close();
  }
});

test("最窄手机上的二维实验画布使用真实显示宽度绘图", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 320, height: 720 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/concept-studio.html?lesson=g7-lower-symmetry`);
    await page.locator("#sceneCanvas").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#sceneCanvas").width > 0);

    const canvas = await page.locator("#sceneCanvas").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      return {
        cssWidth: rect.width,
        cssHeight: rect.height,
        logicalWidth: element.width / dpr,
        logicalHeight: element.height / dpr,
      };
    });

    assert.ok(
      Math.abs(canvas.logicalWidth - canvas.cssWidth) <= 1,
      `二维画布不应在 320px 视口被横向压缩：${JSON.stringify(canvas)}`,
    );
    assert.ok(
      Math.abs(canvas.logicalHeight - canvas.cssHeight) <= 1,
      `二维画布纵向逻辑尺寸应与显示尺寸一致：${JSON.stringify(canvas)}`,
    );
  } finally {
    await page.close();
  }
});

test("有理数浅色课件明确使用浅色浏览器控件", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter2-integers.html`);
    const colorScheme = await page.locator("html").evaluate((element) => getComputedStyle(element).colorScheme);
    assert.equal(colorScheme, "light");
  } finally {
    await page.close();
  }
});

async function readPerpendicularGeometry(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("#cv2");
    const state = eval("s2");
    const rect = canvas.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      points: Object.fromEntries(
        ["A", "B", "P", "Q"].map((name) => [name, { ...state[name] }]),
      ),
    };
  });
}

function assertPerpendicularGeometryWasRemapped(before, after, direction) {
  for (const name of ["A", "B", "P", "Q"]) {
    const point = after.points[name];
    assert.ok(
      point.x >= 0 && point.x <= after.width && point.y >= 0 && point.y <= after.height,
      `${direction} 后 ${name} 点应留在画布内：${JSON.stringify({ before, after })}`,
    );

    const beforeRatio = {
      x: before.points[name].x / before.width,
      y: before.points[name].y / before.height,
    };
    const afterRatio = {
      x: point.x / after.width,
      y: point.y / after.height,
    };
    assert.ok(
      Math.abs(afterRatio.x - beforeRatio.x) <= 0.01
        && Math.abs(afterRatio.y - beforeRatio.y) <= 0.01,
      `${direction} 后 ${name} 点应保持相对画布的位置：${JSON.stringify({ beforeRatio, afterRatio, before, after })}`,
    );
  }
}

test("垂线实验从桌面缩到手机时重映射 A/B/P/Q 坐标", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter7-2-parallel-lines.html`);
    await page.locator('[data-tab="s2"]').click();
    const before = await readPerpendicularGeometry(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction((previousWidth) => (
      document.querySelector("#cv2").getBoundingClientRect().width < previousWidth
    ), before.width);
    const after = await readPerpendicularGeometry(page);

    assertPerpendicularGeometryWasRemapped(before, after, "桌面缩到手机");
  } finally {
    await page.close();
  }
});

test("垂线实验从手机放到桌面时重映射 A/B/P/Q 坐标", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter7-2-parallel-lines.html`);
    await page.locator('[data-tab="s2"]').click();
    const before = await readPerpendicularGeometry(page);

    await page.setViewportSize({ width: 1366, height: 900 });
    await page.waitForFunction((previousWidth) => (
      document.querySelector("#cv2").getBoundingClientRect().width > previousWidth
    ), before.width);
    const after = await readPerpendicularGeometry(page);

    assertPerpendicularGeometryWasRemapped(before, after, "手机放到桌面");
  } finally {
    await page.close();
  }
});

test("平行线课件在显示尺寸不变时不重复分配画布后备缓冲区", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1366, height: 900 },
    reducedMotion: "reduce",
  });
  await page.addInitScript(() => {
    window.__canvasBackingAssignments = {};
    for (const property of ["width", "height"]) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value) {
          if (this.id === "cv1" || this.id === "cv2") {
            const key = `${this.id}:${property}`;
            window.__canvasBackingAssignments[key] = (window.__canvasBackingAssignments[key] ?? 0) + 1;
          }
          descriptor.set.call(this, value);
        },
      });
    }
  });

  try {
    await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter7-2-parallel-lines.html`);
    const cv1Before = await page.evaluate(() => ({ ...window.__canvasBackingAssignments }));
    await page.evaluate(() => eval("drawIntersect()"));
    const cv1After = await page.evaluate(() => ({ ...window.__canvasBackingAssignments }));
    assert.deepEqual(cv1After, cv1Before, "cv1 同尺寸重绘不应重设 width/height");

    await page.locator('[data-tab="s2"]').click();
    const cv2Before = await page.evaluate(() => ({ ...window.__canvasBackingAssignments }));
    await page.evaluate(() => eval("drawPerpendicular()"));
    const cv2After = await page.evaluate(() => ({ ...window.__canvasBackingAssignments }));
    assert.deepEqual(cv2After, cv2Before, "cv2 同尺寸重绘不应重设 width/height");
  } finally {
    await page.close();
  }
});

for (const cancellationEvent of ["pointercancel", "lostpointercapture"]) {
  test(`平行线课件收到 ${cancellationEvent} 后清除两个画布的拖动状态`, async () => {
    const page = await runtime.browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });

    try {
      await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter7-2-parallel-lines.html`);

      const cv1 = page.locator("#cv1");
      const cv1Box = await cv1.boundingBox();
      assert.ok(cv1Box, "环节一画布应可见");
      const angleBefore = await page.locator("#s1_a1").textContent();
      await cv1.dispatchEvent("pointerdown", {
        pointerId: 81,
        pointerType: "touch",
        clientX: cv1Box.x + cv1Box.width / 2,
        clientY: cv1Box.y + cv1Box.height / 2,
      });
      await cv1.dispatchEvent(cancellationEvent, { pointerId: 81, pointerType: "touch" });
      await cv1.dispatchEvent("pointermove", {
        pointerId: 81,
        pointerType: "touch",
        clientX: cv1Box.x + cv1Box.width - 20,
        clientY: cv1Box.y + cv1Box.height / 2,
      });
      assert.equal(
        await page.locator("#s1_a1").textContent(),
        angleBefore,
        `${cancellationEvent} 后环节一不应继续旋转直线`,
      );

      await page.locator('[data-tab="s2"]').click();
      const cv2 = page.locator("#cv2");
      const geometry = await page.evaluate(() => {
        const canvas = document.querySelector("#cv2");
        const rect = canvas.getBoundingClientRect();
        const state = eval("s2");
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, point: { ...state.P } };
      });
      const distanceBefore = await page.locator("#s2_pf").textContent();
      await cv2.dispatchEvent("pointerdown", {
        pointerId: 82,
        pointerType: "touch",
        clientX: geometry.left + geometry.point.x,
        clientY: geometry.top + geometry.point.y,
      });
      await cv2.dispatchEvent(cancellationEvent, { pointerId: 82, pointerType: "touch" });
      await cv2.dispatchEvent("pointermove", {
        pointerId: 82,
        pointerType: "touch",
        clientX: geometry.left + geometry.width * 0.2,
        clientY: geometry.top + geometry.height * 0.2,
      });
      assert.equal(
        await page.locator("#s2_pf").textContent(),
        distanceBefore,
        `${cancellationEvent} 后环节二不应继续移动 P 点`,
      );
    } finally {
      await page.close();
    }
  });
}
