import assert from "node:assert/strict";
import test from "node:test";

import {
  isCompletionFromLocalDate,
  isLessonCompletionMessage
} from "../app/interactive-lesson-message.ts";

const appOrigin = "http://127.0.0.1:3002";

test("只接受同源且课件编号一致的完成消息", () => {
  assert.equal(
    isLessonCompletionMessage(
      appOrigin,
      appOrigin,
      { type: "interactive-lesson-complete", lessonId: "g7-upper-algebra" },
      "g7-upper-algebra"
    ),
    true
  );
});

test("拒绝来自其他来源或其他课件的完成消息", () => {
  assert.equal(
    isLessonCompletionMessage(
      "https://example.com",
      appOrigin,
      { type: "interactive-lesson-complete", lessonId: "g7-upper-algebra" },
      "g7-upper-algebra"
    ),
    false
  );
  assert.equal(
    isLessonCompletionMessage(
      appOrigin,
      appOrigin,
      { type: "interactive-lesson-complete", lessonId: "g7-upper-equations" },
      "g7-upper-algebra"
    ),
    false
  );
});

test("拒绝结构不完整的消息", () => {
  assert.equal(isLessonCompletionMessage(appOrigin, appOrigin, null, "g7-upper-algebra"), false);
  assert.equal(isLessonCompletionMessage(appOrigin, appOrigin, { type: "other" }, "g7-upper-algebra"), false);
});

test("互动课件完成记录只在同一天恢复", () => {
  const now = new Date("2026-09-02T15:00:00+08:00");
  assert.equal(isCompletionFromLocalDate("2026-09-02T09:10:00+08:00", now), true);
  assert.equal(isCompletionFromLocalDate("2026-09-01T23:10:00+08:00", now), false);
  assert.equal(isCompletionFromLocalDate("不是日期", now), false);
});
