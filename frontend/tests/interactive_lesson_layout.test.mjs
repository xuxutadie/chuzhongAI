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

test("相反数公式与距离说明在真实课件中互不遮挡", async () => {
  const page = await runtime.browser.newPage({ reducedMotion: "reduce" });

  try {
    for (const viewport of [
      { name: "常规桌面", width: 1366, height: 768 },
      { name: "宽屏桌面", width: 1920, height: 1080 },
      { name: "手机", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(`${runtime.origin}/interactive-lessons/sims/chapter2-integers.html`);
      await page.locator("#numberSlider").evaluate((slider) => {
        slider.value = "-4";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await page.locator('#answerGrid [data-answer="-2"]').click();
      await page.locator("#nextButton").click();
      await page.locator('body[data-step="opposite"] .distance-caption').waitFor();

      async function assertFormulaGap(stepLabel) {
        const boxes = await page.evaluate(() => {
          function box(selector) {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
          }
          return {
            formula: box("#stageFormula"),
            caption: box(".distance-caption"),
          };
        });
        const overlaps = !(
          boxes.formula.right <= boxes.caption.left
          || boxes.caption.right <= boxes.formula.left
          || boxes.formula.bottom <= boxes.caption.top
          || boxes.caption.bottom <= boxes.formula.top
        );

        assert.equal(
          overlaps,
          false,
          `${viewport.name}${stepLabel}公式与说明发生遮挡：${JSON.stringify(boxes)}`,
        );
        assert.ok(
          boxes.caption.top - boxes.formula.bottom >= 10,
          `${viewport.name}${stepLabel}公式与说明之间应保留至少 10px：${JSON.stringify(boxes)}`,
        );
      }

      await page.locator("#numberSlider").evaluate((slider) => {
        slider.value = "0";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await assertFormulaGap("相反数");

      await page.locator('#answerGrid [data-answer="5"]').click();
      await page.locator("#nextButton").click();
      await page.locator('body[data-step="absolute"] .distance-caption').waitFor();
      await page.locator("#numberSlider").evaluate((slider) => {
        slider.value = "0";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await assertFormulaGap("绝对值");
    }
  } finally {
    await page.close();
  }
});

test("课件嵌入学习页时只由外层页面承担纵向滚动", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/embedded-lesson-harness`);
    const frame = page.frames().find((candidate) => candidate.url().includes("chapter2-integers.html"));
    assert.ok(frame, "测试页应加载真实的有理数互动课件");
    await frame.locator("#numberStage").waitFor();
    await frame.waitForFunction(() => (
      document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1
    ));

    const outerScroll = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    const innerScroll = await frame.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    assert.ok(
      outerScroll.scrollHeight > outerScroll.clientHeight + 1,
      `包含反馈区的学习页应由外层滚动：${JSON.stringify(outerScroll)}`,
    );
    assert.ok(
      innerScroll.scrollHeight <= innerScroll.clientHeight + 1,
      `嵌入课件自身不应再出现第二条纵向滚动条：${JSON.stringify(innerScroll)}`,
    );

    const fallbackLayout = await page.evaluate(() => {
      const frameRect = document.querySelector(".interactive-frame").getBoundingClientRect();
      const buttonRect = document.querySelector(".interactive-frame-fallback-link").getBoundingClientRect();
      return { frameBottom: frameRect.bottom, buttonTop: buttonRect.top };
    });
    assert.ok(
      fallbackLayout.buttonTop >= fallbackLayout.frameBottom,
      `文字替代入口不应覆盖课件内容：${JSON.stringify(fallbackLayout)}`,
    );
  } finally {
    await page.close();
  }
});

test("题内挑战自动高度稳定且完整包含末尾外边距", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });

  try {
    await page.goto(`${runtime.origin}/embedded-question-harness`);
    const frame = page.frames().find((candidate) => candidate.url().includes("chapter1-shapes-world.html"));
    assert.ok(frame, "测试页应加载真实的第一章题内挑战");
    await frame.locator(".lesson-challenge").waitFor();
    await page.waitForTimeout(500);

    const samples = [];
    for (let index = 0; index < 16; index += 1) {
      const frameBox = await page.locator(".math-interaction-frame iframe").boundingBox();
      const inner = await frame.evaluate(() => ({
        clientHeight: document.documentElement.clientHeight,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      samples.push({ height: Math.round(frameBox?.height ?? 0), ...inner });
      await page.waitForTimeout(100);
    }

    const renderedHeights = samples.map((sample) => sample.height);
    assert.ok(
      Math.max(...renderedHeights) - Math.min(...renderedHeights) <= 1,
      `iframe 高度不应持续往返抖动：${JSON.stringify(samples)}`,
    );
    assert.ok(
      samples.every((sample) => sample.scrollHeight <= sample.clientHeight + 1),
      `每一帧都不应恢复内层滚动：${JSON.stringify(samples)}`,
    );
  } finally {
    await page.close();
  }
});

test("课件 iframe 导航到跨域文档时静默停止旧页面监听", async () => {
  const page = await runtime.browser.newPage({
    viewport: { width: 1280, height: 720 },
    reducedMotion: "reduce",
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${runtime.origin}/embedded-lesson-harness`);
    const frame = page.frames().find((candidate) => candidate.url().includes("chapter2-integers.html"));
    assert.ok(frame, "测试页应先连接一个同源课件，以建立尺寸监听");
    await frame.locator("#numberStage").waitFor();

    await page.locator(".interactive-frame").evaluate((iframe) => new Promise((resolve) => {
      iframe.addEventListener("load", resolve, { once: true });
      iframe.src = "data:text/html,<html><body><main>跨域降级内容</main></body></html>";
    }));
    await page.waitForTimeout(100);

    assert.deepEqual(
      pageErrors,
      [],
      `跨域导航只应停止自动测高，不能向页面抛出异常：${JSON.stringify(pageErrors)}`,
    );
  } finally {
    await page.close();
  }
});
