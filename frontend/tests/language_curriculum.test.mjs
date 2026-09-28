import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const curriculumUrl = new URL("../app/language-learning/curriculum.ts", import.meta.url);
const draftSyncUrl = new URL("../app/language-learning/draft-sync.ts", import.meta.url);

test("语文英语上下册覆盖30个教材单元和240道不同轮次题目", async () => {
  const { languageBooks } = await import(curriculumUrl.href);
  assert.deepEqual(languageBooks.map(book => book.units.length), [10, 8, 6, 6]);
  assert.deepEqual(languageBooks.map(book => [book.subject, book.semester]), [
    ["英语", "上册"], ["英语", "下册"], ["语文", "上册"], ["语文", "下册"],
  ]);
  const ids = new Set();
  for (const book of languageBooks) {
    for (const unit of book.units) {
      assert.equal(unit.skills.length, 4);
      assert.equal(unit.questions.length, 4);
      assert.equal(unit.retestQuestions.length, 4);
      assert.equal(new Set([...unit.questions, ...unit.retestQuestions].map(q => q.prompt)).size, 8);
      for (const bank of [unit.questions, unit.retestQuestions]) {
        assert.deepEqual(new Set(bank.map(q => q.skillId)), new Set(unit.skills.map(s => s.id)));
        for (const question of bank) {
          assert.equal(ids.has(question.id), false, question.id);
          ids.add(question.id);
          assert.equal(question.options.length, 3);
          assert.equal(question.options.some(option => option.id === question.answer), true);
          assert.ok(question.explanation.length >= 10);
        }
      }
    }
  }
  assert.equal(ids.size, 240);
});

test("30个单元分别记录已核对的真实 PDF 起始页", async () => {
  const { languageBooks } = await import(curriculumUrl.href);
  assert.deepEqual(
    languageBooks.map(book => book.units.map(unit => unit.pdfPage)),
    [
      [8, 15, 21, 27, 35, 43, 51, 59, 67, 75],
      [8, 17, 25, 33, 41, 49, 57, 65],
      [7, 30, 52, 84, 112, 138],
      [7, 34, 66, 102, 128, 150],
    ],
  );
});

test("单元评分只接受当前有效选项，损坏草稿安全回到首测", async () => {
  const { languageBooks, gradeLanguageAnswers, restoreLanguageDraft } = await import(curriculumUrl.href);
  const unit = languageBooks[0].units[0];
  const correct = Object.fromEntries(unit.questions.map(q => [q.id, q.answer]));
  assert.deepEqual(gradeLanguageAnswers(unit.questions, correct), { answered: 4, wrong: [], correct: 4, allCorrect: true });
  const restored = restoreLanguageDraft(unit, {
    version: 1, phase: "result", diagnosis: { [unit.questions[0].id]: "outside-option", other: "a" },
    retest: {}, writing: "x".repeat(1500), reflection: 9, reviewed: "yes",
  });
  assert.equal(restored.phase, "diagnosis");
  assert.deepEqual(restored.diagnosis, {});
  assert.equal(restored.writing.length, 1400);
  assert.equal(restored.reflection, "");
  assert.equal(restored.reviewed, false);
});

test("任务列表不可用时只恢复当前账号当天已有的语言草稿", async () => {
  const { resolveLanguageSessionAccess } = await import(curriculumUrl.href);
  assert.equal(resolveLanguageSessionAccess("in_progress", false, false), "started");
  assert.equal(resolveLanguageSessionAccess("completed", false, false), "completed");
  assert.equal(resolveLanguageSessionAccess(null, true, true), "offline-draft");
  assert.equal(resolveLanguageSessionAccess(null, true, false), "not-started");
  assert.equal(resolveLanguageSessionAccess(null, false, true), "not-started");
});

test("跨午夜的旧会话在创建新日任务前停止", async () => {
  const { startLanguageSessionForDay } = await import(curriculumUrl.href);
  let starts = 0;
  await assert.rejects(
    startLanguageSessionForDay("2026-09-05", "2026-09-06", async () => { starts += 1; return "started"; }),
    /日期已变化/,
  );
  assert.equal(starts, 0);
  assert.equal(
    await startLanguageSessionForDay("2026-09-06", "2026-09-06", async () => { starts += 1; return "started"; }),
    "started",
  );
  assert.equal(starts, 1);
});

test("语言草稿连续输入只在空闲 650ms 后同步最后一次", async (context) => {
  const { LANGUAGE_DRAFT_SYNC_DELAY_MS, scheduleLanguageDraftSync } = await import(draftSyncUrl.href);
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = [];
  const cancelFirst = scheduleLanguageDraftSync(() => saved.push("旧草稿"));
  cancelFirst();
  scheduleLanguageDraftSync(() => saved.push("最后草稿"));
  context.mock.timers.tick(LANGUAGE_DRAFT_SYNC_DELAY_MS - 1);
  assert.deepEqual(saved, []);
  context.mock.timers.tick(1);
  assert.deepEqual(saved, ["最后草稿"]);
});

test("语言学习页面使用受保护服务保存、错题本和可选AI点评", () => {
  const source = fs.readFileSync(new URL("../app/components/language_unit_session.tsx", import.meta.url), "utf8");
  assert.match(source, /startTodayTask\(taskId\)/);
  assert.match(source, /completeTodayTask\(taskId/);
  assert.match(source, /createWrongQuestion/);
  assert.match(source, /askStudentAssistant/);
  assert.match(source, /diagnosis_answers/);
  assert.match(source, /重新保存|保存本单元完成记录/);
  assert.equal(source.includes("localStorage.setItem(\"token"), false);
});

test("自主语言单元不受数学路线前序锁定", async () => {
  const { createDailyProgress, getTaskAvailability } = await import(new URL("../app/learning-progress.ts", import.meta.url).href);
  const ids = ["language-english-7-upper-u1", "math-shapes-diagnosis", "english-20"];
  const progress = createDailyProgress(ids, "2026-09-05");
  assert.equal(getTaskAvailability(progress, ids, ids[0]), "available");
  assert.equal(getTaskAvailability(progress, ids, ids[1]), "available");
  assert.equal(getTaskAvailability(progress, ids, ids[2]), "locked");
});
