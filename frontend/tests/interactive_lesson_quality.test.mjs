import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import("../public/interactive-lessons/sims/self-developed-lab-model.js");
await import("../public/interactive-lessons/sims/interactive-lesson-quality-model.js");

const lessons = globalThis.SelfDevelopedLabModel.lessons;
const quality = globalThis.InteractiveLessonQualityModel;
const catalogSource = fs.readFileSync(new URL("../app/interactive-lessons/lesson-catalog.ts", import.meta.url), "utf8");

test("29个互动课件均进入质量清单", () => {
  assert.equal(Object.keys(lessons).length, 29);
  assert.deepEqual(Object.keys(quality.lessonScenes).sort(), Object.keys(lessons).sort());
});

test("每个课件具备三级难度、专属场景、双参数和即时自检", () => {
  const results = Object.entries(lessons).map(([id, lesson]) => quality.auditLesson(id, lesson));
  assert.deepEqual(results.filter((result) => !result.passed), []);
});

test("正式目录不再加载旧通用模板或外部课件", () => {
  assert.equal(catalogSource.includes("self-developed-lab.html"), false);
  assert.equal(catalogSource.includes("http://"), false);
  assert.equal(catalogSource.includes("https://"), false);
  assert.equal(catalogSource.includes("concept-studio.html"), true);
});

test("质量标准包含学习闭环和双端验收尺寸", () => {
  assert.deepEqual(quality.requirements.stageIds, ["observe", "experiment", "verify"]);
  assert.deepEqual(quality.requirements.difficultyIds, ["basic", "advanced", "challenge"]);
  assert.ok(quality.requirements.requiredCapabilities.includes("错误反馈"));
  assert.equal(quality.requirements.mobileViewport.width, 390);
});

test("正式互动实验台文件存在且浏览器脚本可解析", () => {
  const htmlUrl = new URL("../public/interactive-lessons/sims/concept-studio.html", import.meta.url);
  const scriptUrl = new URL("../public/interactive-lessons/sims/concept-studio.js", import.meta.url);
  const htmlSource = fs.readFileSync(htmlUrl, "utf8");
  const scriptSource = fs.readFileSync(scriptUrl, "utf8");
  assert.equal(fs.existsSync(htmlUrl), true);
  assert.equal(fs.existsSync(scriptUrl), true);
  assert.doesNotThrow(() => new Function(scriptSource));
  assert.ok(htmlSource.includes("../vendor/three-r128.min.js"));
  assert.ok(htmlSource.includes("../vendor/OrbitControls-r128.js"));
  assert.ok(scriptSource.includes("new THREE.OrbitControls"));
});

test("立方体截面三级难度具有独立任务、范围和验收目标", () => {
  const lesson = lessons["g7-upper-shapes"];
  const profiles = lesson.difficultyProfiles;
  assert.deepEqual(Object.keys(profiles), ["basic", "advanced", "challenge"]);
  assert.equal(new Set(Object.values(profiles).map((profile) => profile.summary)).size, 3);
  assert.equal(new Set(Object.values(profiles).map((profile) => profile.challenge.question)).size, 3);

  const basic = globalThis.SelfDevelopedLabModel.createSession("g7-upper-shapes", "basic");
  const advanced = globalThis.SelfDevelopedLabModel.createSession("g7-upper-shapes", "advanced");
  const challenge = globalThis.SelfDevelopedLabModel.createSession("g7-upper-shapes", "challenge");
  assert.deepEqual([basic.controls[1].min, basic.controls[1].max], [35, 65]);
  assert.deepEqual([advanced.controls[1].min, advanced.controls[1].max], [15, 85]);
  assert.equal(challenge.controls[1].hideValue, true);
  assert.equal(challenge.profile.requiredShape, "三角形");
});

test("丰富的图形世界覆盖四类实验和七种立体图形", () => {
  const htmlSource = fs.readFileSync(new URL("../public/interactive-lessons/sims/concept-studio.html", import.meta.url), "utf8");
  const scriptSource = fs.readFileSync(new URL("../public/interactive-lessons/sims/concept-studio.js", import.meta.url), "utf8");
  assert.ok(htmlSource.includes('id="shapeModules"'));
  for (const moduleName of ["认识立体", "展开与折叠", "截面实验", "三视图"]) assert.ok(scriptSource.includes(moduleName));
  for (const solidName of ["正方体", "长方体", "三棱柱", "四棱锥", "圆柱", "圆锥", "球"]) assert.ok(scriptSource.includes(solidName));
  assert.ok(scriptSource.includes("new THREE.PlaneGeometry(2.2,2.2)"));
  assert.ok(scriptSource.includes('shapeViewMode!=="立体观察"'));
});

test("基本平面图形覆盖四类实验并具备三级独立引导", () => {
  const lesson = lessons["g7-upper-plane-figures"];
  const profiles = lesson.difficultyProfiles;
  const scriptSource = fs.readFileSync(new URL("../public/interactive-lessons/sims/concept-studio.js", import.meta.url), "utf8");
  assert.deepEqual(Object.keys(profiles), ["basic", "advanced", "challenge"]);
  assert.equal(new Set(Object.values(profiles).map((profile) => profile.summary)).size, 3);
  for (const moduleName of ["线的家族", "角度实验", "多边形", "圆与扇形"]) assert.ok(scriptSource.includes(moduleName));
  for (const concept of ["线段", "射线", "直线", "锐角", "直角", "钝角", "扇形"]) assert.ok(scriptSource.includes(concept));
  assert.ok(scriptSource.includes("drawPlaneFigures"));
  assert.ok(scriptSource.includes("planeModuleLearning"));
});
