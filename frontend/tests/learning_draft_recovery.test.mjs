import assert from "node:assert/strict";
import test from "node:test";

const storageUrl = new URL("../app/math-learning/storage.ts", import.meta.url);

test("英语语文引导任务的未完成草稿可以在当前设备恢复", async () => {
  const storage = await import(storageUrl.href);
  assert.equal(typeof storage.saveGuidedTaskDraft, "function");
  assert.equal(typeof storage.loadGuidedTaskDraft, "function");

  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const draft = {
    activeStep: 1,
    answers: { "english-q1": "habit", "english-q2": "复习" },
    reflection: "我还在整理复述内容。"
  };

  assert.equal(storage.saveGuidedTaskDraft("english-20", draft, fakeStorage), true);
  assert.deepEqual(storage.loadGuidedTaskDraft("english-20", fakeStorage), draft);
});

test("互动课未完成的反思和互动通过状态可以在当前设备恢复", async () => {
  const storage = await import(storageUrl.href);
  assert.equal(typeof storage.saveInteractiveLessonDraft, "function");
  assert.equal(typeof storage.loadInteractiveLessonDraft, "function");

  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
  const draft = { reflection: "我发现合并同类项要先看字母和指数。", hasCompletedInteractive: true };

  assert.equal(storage.saveInteractiveLessonDraft("g7-upper-algebra", draft, fakeStorage), true);
  assert.deepEqual(storage.loadInteractiveLessonDraft("g7-upper-algebra", fakeStorage), draft);
});

test("草稿存储被浏览器拦截时返回失败而不抛出异常", async () => {
  const storage = await import(storageUrl.href);
  const blockedStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("storage blocked"); },
    removeItem() { throw new Error("storage blocked"); }
  };

  assert.equal(storage.saveGuidedTaskDraft("chinese-20", {
    activeStep: 2,
    answers: {},
    reflection: "草稿"
  }, blockedStorage), false);
  assert.equal(storage.loadInteractiveLessonDraft("g7-upper-algebra", blockedStorage), null);
});

test("不同学生的本机备用草稿使用独立命名空间", async () => {
  const storage = await import(storageUrl.href);
  const values = new Map();
  const fakeStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };

  storage.saveGuidedTaskDraft("english-20", {
    activeStep: 1,
    answers: { "english-q1": "habit" },
    reflection: "学生一号草稿"
  }, fakeStorage, "student-1");
  storage.saveGuidedTaskDraft("english-20", {
    activeStep: 2,
    answers: { "english-q2": "复习" },
    reflection: "学生二号草稿"
  }, fakeStorage, "student-2");

  assert.equal(storage.loadGuidedTaskDraft("english-20", fakeStorage, "student-1")?.reflection, "学生一号草稿");
  assert.equal(storage.loadGuidedTaskDraft("english-20", fakeStorage, "student-2")?.reflection, "学生二号草稿");
});
