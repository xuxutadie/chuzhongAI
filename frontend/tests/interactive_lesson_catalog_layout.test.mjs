import assert from "node:assert/strict";
import test from "node:test";

import { interactiveLessons } from "../app/interactive-lessons/lesson-catalog.ts";
import { createBrowserLayoutRuntime } from "./helpers/browser-layout-runtime.mjs";

const viewports = [
  { name: "桌面", width: 1366, height: 768 },
  { name: "手机", width: 390, height: 844 },
];

test("29 节正式互动课在桌面和手机上都没有内层纵向或横向滚动", { timeout: 120_000 }, async () => {
  const runtime = await createBrowserLayoutRuntime();
  const page = await runtime.browser.newPage({ reducedMotion: "reduce" });
  const pageErrors = [];
  const failedRequests = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(request.url()));

  try {
    assert.equal(interactiveLessons.length, 29, "正式互动课目录数量发生变化时需同步复查布局矩阵");

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const lesson of interactiveLessons) {
        assert.ok(lesson.localPath, `${lesson.title} 应提供本地互动课件`);
        pageErrors.length = 0;
        failedRequests.length = 0;
        await page.goto(
          `${runtime.origin}/embedded-lesson-harness?src=${encodeURIComponent(lesson.localPath)}`,
          { waitUntil: "load" },
        );
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
        assert.ok(frame, `${lesson.title} 应成功载入 iframe`);
        await frame.locator("body").waitFor();

        await frame.waitForFunction(() => (
          document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1
        ), undefined, { timeout: 4_000 }).catch(() => {});

        const inner = await frame.evaluate(() => ({
          clientHeight: document.documentElement.clientHeight,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        const outer = await page.evaluate(() => ({
          clientHeight: document.documentElement.clientHeight,
          scrollHeight: document.documentElement.scrollHeight,
        }));

        assert.ok(
          inner.scrollHeight <= inner.clientHeight + 1,
          `${viewport.name}端“${lesson.title}”不应产生 iframe 内层纵向滚动：${JSON.stringify(inner)}`,
        );
        assert.ok(
          inner.scrollWidth <= inner.clientWidth + 1,
          `${viewport.name}端“${lesson.title}”不应产生 iframe 内层横向滚动：${JSON.stringify(inner)}`,
        );
        assert.ok(
          outer.scrollHeight > outer.clientHeight + 1,
          `${viewport.name}端“${lesson.title}”应由外层学习页承担纵向滚动：${JSON.stringify(outer)}`,
        );
        assert.deepEqual(
          pageErrors,
          [],
          `${viewport.name}端“${lesson.title}”不应出现脚本运行错误`,
        );
        assert.deepEqual(
          failedRequests,
          [],
          `${viewport.name}端“${lesson.title}”不应有资源加载失败`,
        );
      }
    }
  } finally {
    await page.close();
    await runtime.close();
  }
});
