import assert from "node:assert/strict";
import test from "node:test";

const engineUrl = new URL("../app/math-learning/session-engine.ts", import.meta.url);
const storageUrl = new URL("../app/math-learning/storage.ts", import.meta.url);

function attempt(id, tag, correct, valid = true, round = 1) {
  return {
    questionId: id,
    knowledgePointId: "g7u-shapes-solid",
    capabilityTag: tag,
    answer: correct ? "a" : "b",
    correct,
    valid,
    round,
    answeredAt: "2026-09-03T10:00:00.000Z"
  };
}

test("多个知识点按学生选择顺序逐个学习", async () => {
  const { createSession, getCurrentKnowledgePointId } = await import(engineUrl.href);
  const session = createSession(
    ["g7u-shapes-solid", "g7u-shapes-folding"],
    "2026-09-03",
    "session-1"
  );
  assert.equal(getCurrentKnowledgePointId(session), "g7u-shapes-solid");
  assert.equal(session.phase, "diagnostic");
  assert.equal(session.round, 1);
});

test("100分诊断全部掌握且没有主要问题", async () => {
  const { buildDiagnosis } = await import(engineUrl.href);
  const result = buildDiagnosis([
    attempt("q1", "实物抽象", true),
    attempt("q2", "实物抽象", true),
    attempt("q3", "结构计数", true)
  ]);
  assert.equal(result.score, 100);
  assert.equal(result.passed, true);
  assert.deepEqual(result.weakTags, []);
  assert.equal(result.primaryIssue, null);
  assert.ok(result.items.every((item) => item.status === "掌握"));
});

test("无效图形题保留在评分分母且不会虚高过关", async () => {
  const { buildDiagnosis } = await import(engineUrl.href);
  const result = buildDiagnosis([
    attempt("q1", "实物抽象", true),
    attempt("q2", "结构计数", false),
    attempt("q3", "结构计数", true),
    attempt("q4", "图形加载", false, false)
  ]);
  assert.equal(result.score, 50);
  assert.equal(result.passed, false);
  assert.deepEqual(result.weakTags, ["结构计数"]);
  assert.equal(result.primaryIssue, "需要重点巩固：结构计数。");
  assert.equal(result.items.some((item) => item.capabilityTag === "图形加载"), false);
});

test("98分达到过关线后不再显示薄弱项或主要问题", async () => {
  const { buildDiagnosis } = await import(engineUrl.href);
  const attempts = Array.from({ length: 50 }, (_, index) =>
    attempt(`q${index}`, "综合辨析", index !== 0)
  );
  const result = buildDiagnosis(attempts);
  assert.equal(result.score, 98);
  assert.equal(result.passed, true);
  assert.deepEqual(result.weakTags, []);
  assert.equal(result.primaryIssue, null);
  assert.ok(result.items.every((item) => item.status === "掌握"));
});

test("能力正确率60%显示需巩固但不会判定过关", async () => {
  const { buildDiagnosis } = await import(engineUrl.href);
  const result = buildDiagnosis([
    attempt("q1", "空间想象", true),
    attempt("q2", "空间想象", true),
    attempt("q3", "空间想象", true),
    attempt("q4", "空间想象", false),
    attempt("q5", "空间想象", false)
  ]);
  assert.equal(result.score, 60);
  assert.equal(result.passed, false);
  assert.equal(result.items[0].status, "需巩固");
});

test("同一题重新作答时只保留当前轮次最后一次结果", async () => {
  const { createSession, recordAnswer } = await import(engineUrl.href);
  const original = createSession(["g7u-shapes-solid"], "2026-09-03", "session-2");
  const wrong = recordAnswer(original, attempt("q1", "实物抽象", false));
  const corrected = recordAnswer(wrong, attempt("q1", "实物抽象", true));
  assert.equal(original.answers.length, 0);
  assert.equal(corrected.answers.length, 1);
  assert.equal(corrected.answers[0].correct, true);
});

test("过关后进入下一个知识点，最后一个知识点过关后完成", async () => {
  const { advanceAfterDiagnosis, createSession } = await import(engineUrl.href);
  const session = createSession(
    ["g7u-shapes-solid", "g7u-shapes-folding"],
    "2026-09-03",
    "session-3"
  );
  const firstPassed = advanceAfterDiagnosis(session, {
    score: 100,
    passed: true,
    weakTags: [],
    primaryIssue: null,
    items: []
  });
  assert.equal(firstPassed.currentIndex, 1);
  assert.equal(firstPassed.phase, "diagnostic");
  const allPassed = advanceAfterDiagnosis(firstPassed, {
    score: 100,
    passed: true,
    weakTags: [],
    primaryIssue: null,
    items: []
  });
  assert.equal(allPassed.phase, "passed");
});

test("第三轮仍未过关时进入重点复习", async () => {
  const { advanceAfterDiagnosis, completeTargetedLearning, createSession } = await import(engineUrl.href);
  const failed = { score: 70, passed: false, weakTags: ["结构计数"], primaryIssue: "需要重点巩固：结构计数。", items: [] };
  let session = createSession(["g7u-shapes-solid"], "2026-09-03", "session-4");
  session = advanceAfterDiagnosis(session, failed);
  assert.equal(session.phase, "learning");
  session = completeTargetedLearning(session);
  assert.equal(session.round, 2);
  assert.equal(session.phase, "retest");
  session = advanceAfterDiagnosis(session, failed);
  session = completeTargetedLearning(session);
  assert.equal(session.round, 3);
  session = advanceAfterDiagnosis(session, failed);
  assert.equal(session.phase, "needs-help");
});

test("学习会话可以保存并恢复，损坏数据返回 null", async () => {
  const { createSession } = await import(engineUrl.href);
  const { clearSession, loadSession, saveSession } = await import(storageUrl.href);
  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const session = createSession(["g7u-shapes-solid"], "2026-09-03", "session-5");
  saveSession(session, fakeStorage);
  assert.deepEqual(loadSession("2026-09-03", fakeStorage), session);
  clearSession("2026-09-03", fakeStorage);
  assert.equal(loadSession("2026-09-03", fakeStorage), null);
  values.set("math-learning-session-v1:2026-09-04", "not-json");
  assert.equal(loadSession("2026-09-04", fakeStorage), null);
});

test("恢复时拒绝越界索引、未知阶段和未经验证或未完成全程的已过关状态", async () => {
  const { createSession } = await import(engineUrl.href);
  const { loadSession } = await import(storageUrl.href);
  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const session = createSession(["g7u-shapes-solid"], "2026-09-03", "session-corrupt");
  const multiPointSession = createSession(
    ["g7u-shapes-solid", "g7u-shapes-net"],
    "2026-09-03",
    "session-corrupt-multi",
  );
  const corruptions = [
    { ...session, currentIndex: 1 },
    { ...session, phase: "unknown" },
    { ...session, phase: "passed" },
    {
      ...multiPointSession,
      phase: "passed",
      scores: [
        { round: 1, score: 100, weakTags: [] },
        { round: 1, score: 100, weakTags: [] },
      ],
    },
  ];

  for (const candidate of corruptions) {
    values.set("math-learning-session-v1:2026-09-03", JSON.stringify(candidate));
    assert.equal(loadSession("2026-09-03", fakeStorage), null);
  }
});

test("浏览器存储读写异常时学习会话安全降级", async () => {
  const { createSession } = await import(engineUrl.href);
  const { clearSession, loadSession, saveSession } = await import(storageUrl.href);
  const blockedStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
    removeItem() { throw new Error("storage blocked"); }
  };
  const session = createSession(["g7u-shapes-solid"], "2026-09-03", "session-storage-error");

  assert.equal(saveSession(session, blockedStorage), false);
  assert.equal(loadSession("2026-09-03", blockedStorage), null);
  assert.equal(clearSession("2026-09-03", blockedStorage), false);
});

test("图形题故障后转为必须作答的文字替代题", async () => {
  const { createTextFallbackQuestion } = await import(engineUrl.href);
  const fallback = createTextFallbackQuestion({
    id: "solid-09",
    knowledgePointId: "g7u-shapes-solid",
    capabilityTag: "旋转观察",
    difficulty: "advanced",
    responseType: "interactive",
    prompt: "旋转正方体，找到并确认它的面、棱和顶点。",
    correctAnswer: { challengeId: "solid-cube-parts", passed: true },
    explanation: "正方体有6个面、12条棱和8个顶点。",
    visual: { kind: "solid-model", solid: "cube" },
    source: "local-reviewed"
  });

  assert.equal(fallback.id, "solid-09-text-fallback");
  assert.equal(fallback.responseType, "true-false");
  assert.equal(fallback.visual, undefined);
  assert.equal(fallback.correctAnswer, "true");
  assert.match(fallback.prompt, /正方体有6个面、12条棱和8个顶点/);
});

test("普通图形选择题降级后仍保留原有作答规则", async () => {
  const { createTextFallbackQuestion } = await import(engineUrl.href);
  const fallback = createTextFallbackQuestion({
    id: "solid-02",
    knowledgePointId: "g7u-shapes-solid",
    capabilityTag: "结构计数",
    difficulty: "basic",
    responseType: "single-choice",
    prompt: "一个正方体有多少个面？",
    options: [{ id: "a", text: "4个" }, { id: "b", text: "6个" }],
    correctAnswer: "b",
    explanation: "正方体有6个面。",
    visual: { kind: "solid-model", solid: "cube" },
    source: "local-reviewed"
  });

  assert.equal(fallback.id, "solid-02-text-fallback");
  assert.equal(fallback.responseType, "single-choice");
  assert.equal(fallback.correctAnswer, "b");
  assert.deepEqual(fallback.options, [{ id: "a", text: "4个" }, { id: "b", text: "6个" }]);
  assert.equal(fallback.visual, undefined);
});
