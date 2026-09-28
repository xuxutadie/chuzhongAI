import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

const LESSON_PATH = "/interactive-lessons/sims/chapter7-4-triangle.html";

let runtime;

test.before(async () => {
  runtime = await createBrowserLayoutRuntime();
});

test.after(async () => {
  await runtime?.close();
});

test("四个三角形画布在窄屏下保持各自的设计宽高比", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  const cases = [
    { canvas: "#canvas1", tab: "section1", expectedRatio: 1.1579 },
    { canvas: "#canvas2", tab: "section2", expectedRatio: 1.5714 },
    { canvas: "#canvas3", tab: "section3", expectedRatio: 1.1579 },
    { canvas: "#canvas4", tab: "section4", expectedRatio: 1.375 },
  ];

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);

    for (const item of cases) {
      await page.locator(`.tab-btn[data-tab="${item.tab}"]`).click();
      const box = await page.locator(item.canvas).boundingBox();
      assert.ok(box, `${item.canvas} 应在对应环节中可见`);
      const wrapperBox = await page.locator(item.canvas).locator("..").boundingBox();
      assert.ok(wrapperBox, `${item.canvas} 应有可见容器`);

      const actualRatio = box.width / box.height;
      assert.ok(
        Math.abs(actualRatio - item.expectedRatio) < 0.01,
        `${item.canvas} 的窄屏显示比例失真：实际 ${actualRatio.toFixed(4)}，应为 ${item.expectedRatio}`,
      );
      assert.ok(
        wrapperBox.height - box.height <= 40,
        `${item.canvas} 容器留下 ${(wrapperBox.height - box.height).toFixed(1)}px 无效高度`,
      );
    }
  } finally {
    await page.close();
  }
});

test("四个三角形环节在手机上保持可读字号", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  await page.addInitScript(() => {
    window.__triangleCanvasTextMetrics = [];
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const match = /([\d.]+)px/.exec(this.font);
      const rect = this.canvas.getBoundingClientRect();
      const logicalWidth = Number(this.canvas.dataset.logicalWidth) || this.canvas.width / (window.devicePixelRatio || 1);
      if (match && rect.width > 0 && logicalWidth > 0) {
        const text = String(args[0]);
        const x = Number(args[1]);
        const textWidth = this.measureText(text).width;
        const align = this.textAlign;
        const left = align === "center" ? x - textWidth / 2 : (align === "right" || align === "end" ? x - textWidth : x);
        window.__triangleCanvasTextMetrics.push({
          canvasId: this.canvas.id,
          text,
          effectiveFontSize: Number(match[1]) * rect.width / logicalWidth,
          left,
          right: left + textWidth,
          logicalWidth,
        });
      }
      return originalFillText.apply(this, args);
    };
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);

    for (const item of [
      { canvas: "#canvas1", tab: "section1" },
      { canvas: "#canvas2", tab: "section2" },
      { canvas: "#canvas3", tab: "section3" },
      { canvas: "#canvas4", tab: "section4" },
      { canvas: "#canvas3", tab: "section3", state: "completed-angle-puzzle" },
      { canvas: "#canvas4", tab: "section4", state: "completed-congruence" },
    ]) {
      await page.evaluate(() => { window.__triangleCanvasTextMetrics = []; });
      await page.locator(`.tab-btn[data-tab="${item.tab}"]`).click();
      if (item.state === "completed-angle-puzzle") {
        await page.evaluate(() => {
          puzzleAnimProgress = 1;
          drawTriangle3();
        });
      } else if (item.state === "completed-congruence") {
        await page.evaluate(() => {
          congruentAnimProgress = 1;
          drawTriangle4();
        });
      }
      await page.waitForTimeout(80);
      const metrics = await page.evaluate((canvasId) => {
        const samples = window.__triangleCanvasTextMetrics.filter((entry) => entry.canvasId === canvasId);
        return {
          sampleCount: samples.length,
          minEffectiveFontSize: Math.min(...samples.map((entry) => entry.effectiveFontSize)),
          outOfBounds: samples.filter((entry) => entry.left < -0.5 || entry.right > entry.logicalWidth + 0.5),
        };
      }, item.canvas.slice(1));

      assert.ok(metrics.sampleCount > 0, `${item.canvas} 应绘制可见文字`);
      assert.ok(
        metrics.minEffectiveFontSize >= 11.5,
        `${item.canvas} 最小有效字号仅 ${metrics.minEffectiveFontSize.toFixed(2)}px`,
      );
      assert.deepEqual(
        metrics.outOfBounds,
        [],
        `${item.canvas} 存在被边缘裁切的标注：${JSON.stringify(metrics.outOfBounds)}`,
      );
    }
  } finally {
    await page.close();
  }
});

test("缩放后的三角形画布将拖拽位置映射回设计坐标", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    const canvas = page.locator("#canvas1");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box, "认识三角形画布应可见");

    const start = {
      x: box.x + box.width * (150 / 440),
      y: box.y + box.height * (60 / 380),
    };
    const target = {
      x: box.x + box.width * (250 / 440),
      y: box.y + box.height * (140 / 380),
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.mouse.up();

    const vertex = await page.evaluate(() => ({ x: tri1.A.x, y: tri1.A.y }));
    assert.ok(
      Math.abs(vertex.x - 250) <= 2 && Math.abs(vertex.y - 140) <= 2,
      `拖拽落点没有映射到画布设计坐标：${JSON.stringify(vertex)}`,
    );
  } finally {
    await page.close();
  }
});

test("移动端触控指针可以拖动三角形顶点", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    const canvas = page.locator("#canvas1");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box, "认识三角形画布应可见");

    const start = {
      x: box.x + box.width * (150 / 440),
      y: box.y + box.height * (60 / 380),
    };
    const target = {
      x: box.x + box.width * (210 / 440),
      y: box.y + box.height * (120 / 380),
    };
    const pointer = { pointerId: 7, pointerType: "touch", isPrimary: true };

    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: start.x, clientY: start.y });
    await canvas.dispatchEvent("pointermove", { ...pointer, buttons: 1, clientX: target.x, clientY: target.y });
    await canvas.dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: target.x, clientY: target.y });

    const vertex = await page.evaluate(() => ({ x: tri1.A.x, y: tri1.A.y }));
    assert.ok(
      Math.abs(vertex.x - 210) <= 2 && Math.abs(vertex.y - 120) <= 2,
      `触屏拖拽没有更新顶点：${JSON.stringify(vertex)}`,
    );
  } finally {
    await page.close();
  }
});

test("手指偏离顶点中心仍可命中移动端拖拽目标", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    const canvas = page.locator("#canvas1");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    assert.ok(box, "认识三角形画布应可见");

    const vertexCenter = {
      x: box.x + box.width * (150 / 440),
      y: box.y + box.height * (60 / 380),
    };
    const start = { x: vertexCenter.x + 17, y: vertexCenter.y };
    const target = {
      x: box.x + box.width * (230 / 440),
      y: box.y + box.height * (135 / 380),
    };
    const pointer = { pointerId: 9, pointerType: "touch", isPrimary: true };

    await canvas.dispatchEvent("pointerdown", { ...pointer, buttons: 1, clientX: start.x, clientY: start.y });
    await canvas.dispatchEvent("pointermove", { ...pointer, buttons: 1, clientX: target.x, clientY: target.y });
    await canvas.dispatchEvent("pointerup", { ...pointer, buttons: 0, clientX: target.x, clientY: target.y });

    const vertex = await page.evaluate(() => ({ x: tri1.A.x, y: tri1.A.y }));
    assert.ok(
      Math.abs(vertex.x - 230) <= 2 && Math.abs(vertex.y - 135) <= 2,
      `17px 偏移的手指点击未命中顶点：${JSON.stringify(vertex)}`,
    );
  } finally {
    await page.close();
  }
});

test("拖拽顶点时阻止重合或近乎共线的退化三角形", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 900, height: 800 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    const canvas = page.locator("#canvas1");
    const box = await canvas.boundingBox();
    assert.ok(box, "认识三角形画布应可见");

    const point = (x, y) => ({
      x: box.x + box.width * (x / 440),
      y: box.y + box.height * (y / 380),
    });
    const start = point(150, 60);
    const overlapping = point(60, 320);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(overlapping.x, overlapping.y);
    await page.mouse.up();

    const state = await page.evaluate(() => ({
      minSide: Math.min(dist(tri1.A, tri1.B), dist(tri1.A, tri1.C), dist(tri1.B, tri1.C)),
      values: Array.from(document.querySelectorAll("#angle-a, #angle-b, #angle-c, #angle-sum"), (el) => el.textContent),
    }));
    assert.ok(state.minSide >= 24, `顶点发生重合，最短边仅 ${state.minSide}`);
    assert.ok(state.values.every((value) => !value.includes("NaN")), `角度面板出现非法值：${state.values.join(" / ")}`);
  } finally {
    await page.close();
  }
});

test("嵌入学习页后四个环节按钮使用紧凑样式且保持同一行", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });

  try {
    const source = encodeURIComponent(LESSON_PATH);
    await page.goto(`${runtime.origin}/embedded-lesson-harness?src=${source}`);
    const frame = page.frames().find((candidate) => (
      candidate !== page.mainFrame()
      && new URL(candidate.url()).pathname.endsWith("chapter7-4-triangle.html")
    ));
    assert.ok(frame, "测试页应加载真实的三角形互动课件");
    await frame.locator("body.embedded").waitFor();

    const metrics = await frame.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".tab-btn"));
      const rects = buttons.map((button) => button.getBoundingClientRect());
      return {
        buttonCount: buttons.length,
        buttonHeight: rects[0]?.height ?? 0,
        maxTopDifference: Math.max(...rects.map((rect) => Math.abs(rect.top - rects[0].top))),
        headerDisplay: getComputedStyle(document.querySelector(".header")).display,
      };
    });

    assert.equal(metrics.buttonCount, 4, "嵌入课件应保留四个环节入口");
    assert.equal(metrics.headerDisplay, "none", "嵌入课件应隐藏重复的大标题");
    assert.ok(
      metrics.buttonHeight <= 40,
      `嵌入页签没有应用紧凑样式，按钮高度为 ${metrics.buttonHeight}px`,
    );
    assert.ok(
      metrics.maxTopDifference <= 1,
      `嵌入页签应保持在同一行，最大纵向偏差为 ${metrics.maxTopDifference}px`,
    );
  } finally {
    await page.close();
  }
});

test("从桌面缩到手机后当前画布会重绘并保持可读字号", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 900, height: 800 } });
  await page.addInitScript(() => {
    window.__resizeFontSamples = [];
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const match = /([\d.]+)px/.exec(this.font);
      const rect = this.canvas.getBoundingClientRect();
      const logicalWidth = Number(this.canvas.dataset.logicalWidth) || 1;
      if (match && this.canvas.id === "canvas1" && rect.width > 0) {
        window.__resizeFontSamples.push(Number(match[1]) * rect.width / logicalWidth);
      }
      return originalFillText.apply(this, args);
    };
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    await page.evaluate(() => { window.__resizeFontSamples = []; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    const samples = await page.evaluate(() => window.__resizeFontSamples);
    assert.ok(samples.length > 0, "视口变化后应主动重绘当前三角形画布");
    assert.ok(Math.min(...samples) >= 11.5, `缩到手机后最小有效字号仅 ${Math.min(...samples).toFixed(2)}px`);
  } finally {
    await page.close();
  }
});

test("三边关系首次进入和选择预设时直接展示完整结果", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    await page.locator('.tab-btn[data-tab="section2"]').click();
    assert.equal(await page.evaluate(() => tri2AnimProgress), 1, "首次进入不应只显示接近空白的动画起点");

    await page.locator('#section2 .preset-btn[data-tri="2,3,6"]').click();
    assert.equal(await page.evaluate(() => tri2AnimProgress), 1, "选择预设后应立即展示能否闭合的完整图示");
  } finally {
    await page.close();
  }
});
