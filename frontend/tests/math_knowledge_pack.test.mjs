import assert from "node:assert/strict";
import test from "node:test";

const validationModuleUrl = new URL("../app/math-learning/validation.ts", import.meta.url);
const packModuleUrl = new URL("../app/math-learning/chapter1-shapes-pack.ts", import.meta.url);

function validQuestion(overrides = {}) {
  return {
    id: "solid-basic-01",
    knowledgePointId: "g7u-shapes-solid",
    capabilityTag: "识别立体图形",
    difficulty: "basic",
    responseType: "single-choice",
    prompt: "篮球可以近似看成哪一种立体图形？",
    options: [
      { id: "a", text: "球" },
      { id: "b", text: "圆柱" },
      { id: "c", text: "正方体" }
    ],
    correctAnswer: "a",
    explanation: "篮球的表面是曲面，可以近似看成球。",
    source: "local-reviewed",
    ...overrides
  };
}

test("合法的本地选择题通过校验", async () => {
  const { validateQuestion } = await import(validationModuleUrl.href);
  assert.deepEqual(validateQuestion(validQuestion()), { ok: true });
});

test("题干要求看图但没有 visual 时拒绝题目", async () => {
  const { validateQuestion } = await import(validationModuleUrl.href);
  const result = validateQuestion(validQuestion({ prompt: "观察如下图，选择正确答案。" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("看图题必须提供 visual"));
});

test("单选题答案不在选项中时拒绝题目", async () => {
  const { validateQuestion } = await import(validationModuleUrl.href);
  const result = validateQuestion(validQuestion({ correctAnswer: "z" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("正确答案必须引用现有选项"));
});

test("未知图形渲染类型被拒绝", async () => {
  const { validateQuestion } = await import(validationModuleUrl.href);
  const result = validateQuestion(validQuestion({
    visual: { kind: "generated-html", code: "<script></script>" }
  }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("visual.kind 不在允许范围内"));
});

test("已知图形类型缺少必要参数时也会被拒绝", async () => {
  const { validateQuestion } = await import(validationModuleUrl.href);
  const question = validQuestion({
    id: "bad-solid-params",
    prompt: "观察图形并判断",
    visual: { kind: "solid-model" }
  });
  const result = validateQuestion(question);
  assert.equal(result.ok, false);
});

test("不足10题或不足4种作答方式的能力包被拒绝", async () => {
  const { validateKnowledgePackage } = await import(validationModuleUrl.href);
  const pack = {
    id: "g7u-shapes-solid",
    subject: "数学",
    grade: 7,
    semester: "上册",
    textbookVersion: "北师大版",
    chapterId: "g7u-chapter-1",
    title: "生活中的立体图形",
    lessonId: "g7-upper-shapes",
    interaction: { section: "shapes", supportedDifficulties: ["basic", "advanced", "challenge"] },
    capabilityTags: ["识别立体图形"],
    questions: [validQuestion()]
  };
  const result = validateKnowledgePackage(pack);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("能力包至少需要10道题"));
  assert.ok(result.errors.includes("能力包至少需要4种作答方式"));
});

test("第一章四个知识点均有至少10个有效任务和4种作答方式", async () => {
  const { validateKnowledgePackage } = await import(validationModuleUrl.href);
  const { chapter1ShapePackages } = await import(packModuleUrl.href);
  assert.deepEqual(
    chapter1ShapePackages.map((pack) => pack.id),
    [
      "g7u-shapes-solid",
      "g7u-shapes-folding",
      "g7u-shapes-section",
      "g7u-shapes-views"
    ]
  );
  assert.ok(chapter1ShapePackages.reduce((total, pack) => total + pack.questions.length, 0) >= 40);
  for (const pack of chapter1ShapePackages) {
    assert.ok(pack.questions.length >= 10);
    assert.ok(new Set(pack.questions.map((question) => question.responseType)).size >= 4);
    assert.deepEqual(validateKnowledgePackage(pack), { ok: true });
  }
});

test("第一章每个能力包覆盖三级难度、互动题和真实图形参数", async () => {
  const { chapter1ShapePackages } = await import(packModuleUrl.href);
  for (const pack of chapter1ShapePackages) {
    assert.deepEqual(
      [...new Set(pack.questions.map((question) => question.difficulty))].sort(),
      ["advanced", "basic", "challenge"]
    );
    assert.ok(pack.questions.some((question) => question.responseType === "interactive"));
    assert.ok(pack.questions.filter((question) => question.visual).length >= 2);
    assert.ok(pack.questions.every((question) => question.source === "local-reviewed"));
  }
});

test("能力包可以按知识点编号准确查找", async () => {
  const { getMathKnowledgePackage } = await import(packModuleUrl.href);
  assert.equal(getMathKnowledgePackage("g7u-shapes-section")?.title, "截一个几何体");
  assert.equal(getMathKnowledgePackage("missing"), null);
});
