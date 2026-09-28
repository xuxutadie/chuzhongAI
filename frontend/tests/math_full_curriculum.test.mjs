import assert from "node:assert/strict";
import test from "node:test";

const registryUrl = new URL("../app/math-learning/knowledge-registry.ts", import.meta.url);
const validationUrl = new URL("../app/math-learning/validation.ts", import.meta.url);
const studyUrl = new URL("../app/math-learning/targeted-study.ts", import.meta.url);

test("七年级上册六章各有四个可学习知识点，新章首测与过关题独立", async () => {
  const { mathKnowledgePackages, getMathKnowledgePackage } = await import(registryUrl.href);
  const { validateKnowledgePackage } = await import(validationUrl.href);
  assert.equal(mathKnowledgePackages.length, 24);
  const ids = new Set();
  for (let chapter = 1; chapter <= 6; chapter += 1) {
    const packs = mathKnowledgePackages.filter((pack) => pack.chapterId === `g7u-chapter-${chapter}`);
    assert.equal(packs.length, 4);
    for (const pack of packs) {
      assert.equal(getMathKnowledgePackage(pack.id), pack);
      assert.deepEqual(validateKnowledgePackage(pack), { ok: true }, pack.id);
      assert.equal(pack.questions.length, 10);
      if (chapter > 1) {
        assert.equal(pack.learningMode, "explanation");
        assert.equal(pack.retestQuestions.length, 10);
        assert.ok(pack.learningGuide.steps.length >= 2);
        assert.ok(pack.learningGuide.pitfalls.length > 0);
        assert.equal(pack.interaction, undefined);
        const prompts = new Set(pack.questions.map((q) => q.prompt));
        assert.ok(pack.retestQuestions.every((q) => !prompts.has(q.prompt)));
      }
      for (const bank of [pack.questions, ...(pack.retestQuestions ? [pack.retestQuestions] : [])]) {
        assert.deepEqual([...new Set(bank.map((q) => q.difficulty))].sort(), ["advanced", "basic", "challenge"]);
        assert.ok(new Set(bank.map((q) => q.responseType)).size >= 3);
        for (const q of bank) {
          assert.ok(!ids.has(q.id), `重复题号 ${q.id}`);
          ids.add(q.id);
          assert.equal(q.knowledgePointId, pack.id);
          if (chapter > 1) {
            assert.ok(pack.capabilityTags.includes(q.capabilityTag), `${q.id} 的能力标签不在知识点内`);
            assert.equal(q.visual, undefined);
            assert.notEqual(q.responseType, "interactive");
            assert.equal(new Set(q.options.map((o) => o.id)).size, q.options.length);
            assert.equal(new Set(q.options.map((o) => o.text)).size, q.options.length);
          }
        }
      }
    }
  }
  assert.equal(getMathKnowledgePackage("not-registered"), null);
});

test("新章全部知识点可从首测失败经针对学习到过关，并生成最后一轮完成凭据", async () => {
  const { mathKnowledgePackages } = await import(registryUrl.href);
  const engine = await import(new URL("../app/math-learning/session-engine.ts", import.meta.url).href);
  const { buildMathCompletionAttempts } = await import(new URL("../app/student-learning-evidence.ts", import.meta.url).href);
  const { getReviewQuestions, getRoundQuestions } = await import(studyUrl.href);
  for (const pack of mathKnowledgePackages.filter(p => p.learningMode === "explanation")) {
    let session = engine.createSession([pack.id], "2026-09-05", `check-${pack.id}`);
    for (const [index, q] of pack.questions.entries()) {
      const answer = index === 0 ? "invalid-answer" : q.correctAnswer;
      session = engine.recordAnswer(session, { questionId: q.id, knowledgePointId: pack.id, capabilityTag: q.capabilityTag,
        answer, correct: engine.isQuestionAnswerCorrect(q, answer), valid: true, round: 1, answeredAt: "2026-09-05T00:00:00Z" });
    }
    const diagnosis = engine.scoreRound(session);
    assert.equal(diagnosis.score, 90);
    assert.deepEqual(getReviewQuestions(pack, session.answers), [pack.questions[0]]);
    session = engine.advanceAfterDiagnosis(session, diagnosis);
    assert.equal(session.phase, "learning");
    session = engine.completeTargetedLearning(session);
    for (const q of getRoundQuestions(pack, session.round)) {
      session = engine.recordAnswer(session, { questionId: q.id, knowledgePointId: pack.id, capabilityTag: q.capabilityTag,
        answer: q.correctAnswer, correct: engine.isQuestionAnswerCorrect(q, q.correctAnswer), valid: true, round: 2, answeredAt: "2026-09-05T00:10:00Z" });
    }
    session = engine.advanceAfterDiagnosis(session, engine.scoreRound(session));
    assert.equal(session.phase, "passed");
    assert.deepEqual(buildMathCompletionAttempts(session), pack.retestQuestions.map(q => ({ question_id: q.id, answer: q.correctAnswer })));
  }
});

test("全册目录显示章节名称而不是内部编号，文字包缺少讲解或错用过关题会被拒绝", async () => {
  const { mathKnowledgePackages, additionalMathChapters } = await import(registryUrl.href);
  const { getAvailableCourses } = await import(new URL("../app/math-learning/course-catalog.ts", import.meta.url).href);
  const chapters = getAvailableCourses(mathKnowledgePackages)[0].chapters;
  assert.equal(chapters.length, 6);
  assert.deepEqual(chapters.slice(1).map(c => c.title), additionalMathChapters.map(c => c.title));
  const { validateKnowledgePackage } = await import(validationUrl.href);
  const pack = mathKnowledgePackages.find(p => p.learningMode === "explanation");
  for (const broken of [
    { ...pack, learningGuide: undefined },
    { ...pack, retestQuestions: [] },
    { ...pack, retestQuestions: pack.retestQuestions.map(q => ({ ...q, knowledgePointId: "other" })) },
  ]) assert.equal(validateKnowledgePackage(broken).ok, false);
});

test("非互动知识点的针对学习能列出真实错题讲解并选择独立过关题", async () => {
  const { getReviewQuestions, getRoundQuestions } = await import(studyUrl.href);
  const pack = {
    id: "topic", questions: [
      { id: "q1", capabilityTag: "加法", explanation: "加法过程" },
      { id: "q2", capabilityTag: "减法", explanation: "减法过程" },
    ],
    retestQuestions: [{ id: "r1", capabilityTag: "加法", explanation: "新的加法过程" }],
  };
  assert.equal(getRoundQuestions(pack, 1), pack.questions);
  assert.equal(getRoundQuestions(pack, 2), pack.retestQuestions);
  assert.equal(getRoundQuestions(pack, 3), pack.retestQuestions);
  assert.deepEqual(getReviewQuestions(pack, [{ questionId: "q2", correct: false, valid: true }]), [pack.questions[1]]);
  assert.deepEqual(getReviewQuestions(pack, [{ questionId: "r1", correct: false, valid: true }]), [pack.retestQuestions[0]]);
  assert.deepEqual(getReviewQuestions(pack, [{ questionId: "q1", correct: true, valid: true }]), []);
  assert.equal(getRoundQuestions({ questions: pack.questions }, 2), pack.questions);
});
