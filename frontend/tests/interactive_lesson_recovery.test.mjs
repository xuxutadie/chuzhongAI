import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  getInteractiveFallbackMessage,
  parseInteractiveLessonProgress,
} from "../app/interactive-lesson-recovery.ts";

test("互动课本地完成记录只接受普通对象与完整条目", () => {
  assert.deepEqual(parseInteractiveLessonProgress(null), {});
  assert.deepEqual(parseInteractiveLessonProgress("[]"), {});
  assert.deepEqual(parseInteractiveLessonProgress('"错误"'), {});
  assert.deepEqual(parseInteractiveLessonProgress(JSON.stringify({
    "g7-upper-algebra": { completedAt: "2026-09-05T08:00:00.000Z", note: "我学会了合并同类项" },
    broken: null,
  })), {
    "g7-upper-algebra": { completedAt: "2026-09-05T08:00:00.000Z", note: "我学会了合并同类项" },
  });
});

test("互动框架加载失败时有明确的文字替代学习提示", () => {
  assert.match(getInteractiveFallbackMessage("整式加减"), /文字替代/);
  assert.match(getInteractiveFallbackMessage("整式加减"), /整式加减/);
});

test("互动课只有账号记录同步成功后才显示已保存", () => {
  const source = fs.readFileSync(
    new URL("../app/components/interactive_lesson_player.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const accountSaved = await saveWorkspaceEntry\(/);
  assert.match(source, /if \(!accountSaved\)/);
  assert.match(source, /账号记录还未保存/);
});
