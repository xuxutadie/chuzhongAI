import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

const LESSON_PATH = "/interactive-lessons/sims/chapter6-data-statistics.html";

let runtime;

test.before(async () => {
  runtime = await createBrowserLayoutRuntime();
});

test.after(async () => {
  await runtime?.close();
});

test("统计图与数轴画布在手机宽度下不经过 CSS 二次压缩", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);

    const cases = [
      { tab: "section3", canvas: "#chartCanvas", name: "统计图" },
      { tab: "section4", canvas: "#numberLineCanvas", name: "数轴" },
    ];

    for (const item of cases) {
      await page.locator(`.tab-btn[data-tab="${item.tab}"]`).click();
      const metrics = await page.locator(item.canvas).evaluate((canvas) => {
        const box = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        return {
          renderedRatio: box.width / box.height,
          logicalRatio: (canvas.width / dpr) / (canvas.height / dpr),
        };
      });
      assert.ok(
        Math.abs(metrics.renderedRatio - metrics.logicalRatio) <= 0.02,
        `${item.name}仍被 CSS 二次缩放：显示比例 ${metrics.renderedRatio.toFixed(3)}，逻辑比例 ${metrics.logicalRatio.toFixed(3)}`,
      );
    }
  } finally {
    await page.close();
  }
});

test("手机上的统计图与数轴文字保持可读且画布容器不留大片空白", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });

  await page.addInitScript(() => {
    window.__canvasTextMetrics = [];
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      const match = /([\d.]+)px/.exec(this.font);
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const logicalWidth = this.canvas.width / dpr;
      if (match && rect.width > 0 && logicalWidth > 0) {
        const text = String(args[0]);
        const x = Number(args[1]);
        const textWidth = this.measureText(text).width;
        const align = this.textAlign;
        const left = align === "center" ? x - textWidth / 2 : (align === "right" || align === "end" ? x - textWidth : x);
        window.__canvasTextMetrics.push({
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
      { tab: "section3", canvasId: "chartCanvas", chart: "bar", name: "条形图" },
      { tab: "section3", canvasId: "chartCanvas", chart: "line", name: "折线图" },
      { tab: "section3", canvasId: "chartCanvas", chart: "pie", name: "扇形图" },
      { tab: "section4", canvasId: "numberLineCanvas", name: "数轴" },
    ]) {
      await page.locator(`.tab-btn[data-tab="${item.tab}"]`).click();
      await page.evaluate(() => { window.__canvasTextMetrics = []; });
      if (item.chart) {
        await page.locator(`.chart-btn[data-chart="${item.chart}"]`).click();
      }
      if (item.tab === "section4") {
        await page.locator('.preset-btn[data-preset="exam"]').click();
      }
      await page.waitForTimeout(350);

      const metrics = await page.evaluate((canvasId) => {
        const canvas = document.getElementById(canvasId);
        const wrapper = canvas.parentElement;
        const canvasRect = canvas.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        const samples = window.__canvasTextMetrics.filter((entry) => entry.canvasId === canvasId);
        return {
          minEffectiveFontSize: Math.min(...samples.map((entry) => entry.effectiveFontSize)),
          sampleCount: samples.length,
          unusedHeight: wrapperRect.height - canvasRect.height,
          outOfBounds: samples.filter((entry) => entry.left < -0.5 || entry.right > entry.logicalWidth + 0.5),
          texts: Array.from(new Set(samples.map((entry) => entry.text))),
        };
      }, item.canvasId);

      assert.ok(metrics.sampleCount > 0, `${item.name}应实际绘制文字`);
      assert.ok(
        metrics.minEffectiveFontSize >= 11.5,
        `${item.name}最小有效字号仅 ${metrics.minEffectiveFontSize.toFixed(2)}px，手机上难以辨认`,
      );
      assert.ok(
        metrics.unusedHeight <= 40,
        `${item.name}容器留下 ${metrics.unusedHeight.toFixed(1)}px 无效高度`,
      );
      assert.deepEqual(
        metrics.outOfBounds,
        [],
        `${item.name}存在被画布边缘裁切的文字：${JSON.stringify(metrics.outOfBounds)}`,
      );
      if (item.tab === "section4") {
        assert.ok(metrics.texts.includes("55") && metrics.texts.includes("100"), `数轴应显示左右端点 55 和 100：${metrics.texts.join(", ")}`);
        assert.ok(metrics.texts.filter((text) => /^\d+$/.test(text)).length >= 4, `数轴有效刻度过少：${metrics.texts.join(", ")}`);
      }
    }
  } finally {
    await page.close();
  }
});

test("嵌入课件时标签按钮使用精简间距与字号", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });

  try {
    const source = encodeURIComponent(LESSON_PATH);
    await page.goto(`${runtime.origin}/embedded-lesson-harness?src=${source}`);
    const frame = page.frames().find((candidate) => {
      try {
        return new URL(candidate.url()).pathname.endsWith("/chapter6-data-statistics.html");
      } catch {
        return false;
      }
    });
    assert.ok(frame, "测试页应加载真实的数据统计互动课件");
    await frame.locator("body.embedded .tab-btn").first().waitFor({ state: "attached" });

    const styles = await frame.locator(".tab-btn").first().evaluate((button) => {
      const computed = getComputedStyle(button);
      return {
        borderRadius: computed.borderRadius,
        fontSize: computed.fontSize,
        paddingLeft: computed.paddingLeft,
        paddingTop: computed.paddingTop,
      };
    });

    assert.deepEqual(styles, {
      borderRadius: "18px",
      fontSize: "13px",
      paddingLeft: "14px",
      paddingTop: "6px",
    });
  } finally {
    await page.close();
  }
});

test("手机端频数表不会撑宽整页且可横向查看全部列", async () => {
  const page = await runtime.browser.newPage({ viewport: { width: 320, height: 720 } });
  try {
    await page.goto(`${runtime.origin}${LESSON_PATH}`);
    await page.locator('.tab-btn[data-tab="section2"]').click();

    const rootWidth = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(rootWidth.scroll <= rootWidth.client + 1, `频数表撑宽了整页：${JSON.stringify(rootWidth)}`);

    const scroller = page.locator(".freq-table-scroll");
    await scroller.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    const metrics = await page.evaluate(() => {
      const container = document.querySelector(".freq-table-scroll").getBoundingClientRect();
      const lastHeader = document.querySelector("#freqTable th:last-child").getBoundingClientRect();
      return {
        scrollable: document.querySelector(".freq-table-scroll").scrollWidth > document.querySelector(".freq-table-scroll").clientWidth,
        lastColumnVisible: lastHeader.left >= container.left - 1 && lastHeader.right <= container.right + 1,
        container: { left: container.left, right: container.right },
        lastHeader: { left: lastHeader.left, right: lastHeader.right },
        scrollLeft: document.querySelector(".freq-table-scroll").scrollLeft,
      };
    });
    assert.equal(metrics.scrollable, true, "窄屏频数表应在自身区域内支持左右滑动");
    assert.equal(metrics.lastColumnVisible, true, `滑到最右侧后应能完整看到频数分布条列：${JSON.stringify(metrics)}`);
  } finally {
    await page.close();
  }
});
