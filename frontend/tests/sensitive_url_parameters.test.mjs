import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("错题正文与错误原因不会被拼进 URL 或交给公开助手页面", () => {
  const workspace = fs.readFileSync(
    new URL("../app/components/wrong_question_workspace.tsx", import.meta.url),
    "utf8",
  );
  const card = fs.readFileSync(
    new URL("../app/components/wrong_question_record_card.tsx", import.meta.url),
    "utf8",
  );

  assert.equal(workspace.includes("&question=${encodeURIComponent(record.questionText)}"), false);
  assert.equal(workspace.includes("&reason=${encodeURIComponent(record.mistakeReason)}"), false);
  assert.equal(workspace.includes("assistant?"), false);
  assert.equal(card.includes("assistant?"), false);
});
