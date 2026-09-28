import assert from "node:assert/strict";
import test from "node:test";

import { buildMathCompletionAttempts } from "../app/student-learning-evidence.ts";

function attempt(questionId, knowledgePointId, round, correct = true) {
  return {
    questionId,
    knowledgePointId,
    capabilityTag: "结构辨析",
    answer: questionId === "solid-09" ? { challengeId: "solid-cube-parts", passed: true } : "a",
    correct,
    valid: true,
    round,
    answeredAt: "2026-09-05T08:00:00.000Z"
  };
}

test("数学完成证据只提交每个知识点最终通过轮，且题号不重复", () => {
  const session = {
    phase: "passed",
    selectedKnowledgePointIds: ["solid", "fold"],
    answers: [
      attempt("solid-01", "solid", 1, false),
      attempt("solid-01", "solid", 2),
      attempt("solid-09", "solid", 2),
      attempt("fold-01", "fold", 1),
      attempt("fold-02", "fold", 1),
    ]
  };

  assert.deepEqual(buildMathCompletionAttempts(session), [
    { question_id: "solid-01", answer: "a" },
    { question_id: "solid-09", answer: { challengeId: "solid-cube-parts", passed: true } },
    { question_id: "fold-01", answer: "a" },
    { question_id: "fold-02", answer: "a" },
  ]);
});

test("未通过或包含无效作答的数学会话不能生成完成证据", () => {
  const session = {
    phase: "passed",
    selectedKnowledgePointIds: ["solid"],
    answers: [
      { ...attempt("solid-01", "solid", 1), valid: false }
    ]
  };

  assert.deepEqual(buildMathCompletionAttempts(session), []);
});

test("未经服务端登记的 AI 变式题不会作为任务完成证据提交", () => {
  const session = {
    phase: "passed",
    selectedKnowledgePointIds: ["solid"],
    answers: [
      attempt("ai-solid-variant-1", "solid", 2),
    ]
  };

  assert.deepEqual(buildMathCompletionAttempts(session), []);
});
