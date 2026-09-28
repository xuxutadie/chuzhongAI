import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const presentationUrl = new URL("../app/math-learning/visual-presentation.js", import.meta.url);
const interactionPath = new URL("../app/components/math_interaction_question.tsx", import.meta.url);
const lessonPath = new URL("../public/interactive-lessons/sims/chapter1-shapes-world.html", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);

function visualQuestion(visual) {
  return {
    id: "visual-question",
    knowledgePointId: "g7u-shapes-solid",
    capabilityTag: "结构辨析",
    difficulty: "basic",
    responseType: "single-choice",
    prompt: "观察图形并判断。",
    options: [{ id: "a", text: "正确" }, { id: "b", text: "错误" }],
    correctAnswer: "a",
    explanation: "说明。",
    source: "local-reviewed",
    visual,
  };
}

test("圆柱题和圆柱截面题生成题目专属展示描述", async () => {
  const { createVisualPresentation } = await import(presentationUrl.href);
  assert.deepEqual(
    createVisualPresentation(visualQuestion({ kind: "solid-model", solid: "cylinder" })),
    { mode: "preview", section: "shapes", solid: "cylinder" },
  );
  assert.deepEqual(
    createVisualPresentation(visualQuestion({
      kind: "cross-section", solid: "cylinder", planePreset: "parallel-base",
    })),
    { mode: "preview", section: "cut", solid: "cylinder", planePreset: "parallel-base" },
  );
  assert.equal(createVisualPresentation({ ...visualQuestion(undefined), visual: undefined }), null);
});

test("未知或课件不支持的图形参数被拒绝，不允许退回正方体", async () => {
  const { validateVisualPresentation } = await import(presentationUrl.href);
  assert.deepEqual(validateVisualPresentation({ kind: "solid-model", solid: "prism" }), {
    ok: false,
    error: "不支持的立体模型：prism",
  });
  assert.deepEqual(validateVisualPresentation({
    kind: "cross-section", solid: "cylinder", planePreset: "diagonal",
  }), {
    ok: false,
    error: "圆柱截面不支持 diagonal",
  });
});

test("预览模式只展示辅助图形，挑战模式才包含即时挑战", () => {
  const component = fs.readFileSync(interactionPath, "utf8");
  const lesson = fs.readFileSync(lessonPath, "utf8");
  assert.match(component, /mode: presentation\.mode/);
  assert.match(component, /params\.set\("solid", presentation\.solid\)/);
  assert.match(lesson, /const displayMode = lessonParams\.get\('mode'\)/);
  assert.match(lesson, /const isPreview = displayMode === 'preview'/);
  assert.match(lesson, /document\.body\.classList\.toggle\('preview'/);
  assert.match(lesson, /requestedSolid/);
});

test("圆柱截面场景的模型、提示和结果均来自同一图形参数", () => {
  const lesson = fs.readFileSync(lessonPath, "utf8");
  assert.match(lesson, /cutSolid/);
  assert.match(lesson, /id="panel-cut"[\s\S]*?id="cutExplainer"/);
  assert.match(lesson, /cutExplainer\.textContent/);
  assert.match(lesson, /parallel-base/);
  assert.match(lesson, /圆柱/);
  assert.match(lesson, /圆形/);
});

test("手机端确认操作区不会固定遮挡图形或答题内容", () => {
  const styles = fs.readFileSync(stylesPath, "utf8");
  const mobileStart = styles.indexOf("@media (max-width: 760px) {\n  .math-learning-workspace");
  const mobileEnd = styles.indexOf("@media (max-width: 420px)", mobileStart);
  const mobileStyles = styles.slice(mobileStart, mobileEnd);

  assert.ok(mobileStart >= 0 && mobileEnd > mobileStart);
  assert.match(mobileStyles, /\.math-sticky-action\s*\{\s*position:\s*static;/);
  assert.doesNotMatch(mobileStyles, /\.math-sticky-action\s*\{\s*position:\s*fixed;/);
});

test("题内互动课件按真实内容高度展开，避免外页和课件双重滚动", () => {
  const component = fs.readFileSync(interactionPath, "utf8");

  assert.match(component, /observeIframeAutoHeight/);
  assert.match(component, /style=\{frameHeight === null \? undefined : \{ height:/);
});
