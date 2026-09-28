# 学习流程一致性修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前数学学习流程中的课程选择、题目、图形和互动挑战始终一致，并以自动化测试阻止同类回归。

**Architecture:** 使用纯函数将每道题的 `visual` 映射为受限展示描述；普通题以“预览”模式嵌入图形，互动题以“挑战”模式嵌入课件。课程选择从能力包元数据生成，并只暴露真实已导入的课程范围。

**Tech Stack:** Next.js、React、TypeScript、Node 内置测试、现有 Three.js 互动课件。

**Spec:** `docs/superpowers/specs/2026-09-04-learning-flow-consistency-design.md`

## Global Constraints

- 不新增第三方依赖，不修改 `.env`、后端接口或数据库结构。
- 所有题目图形必须从 `MathQuestion.visual` 推导，禁止使用知识点包默认场景作为普通题的回退。
- 普通题预览不得显示互动挑战；互动题成功后只保留外层“下一题”导航。
- 每项生产代码改动前必须存在并运行对应失败测试。

---

### Task 1: 题目展示描述与题库校验

**Files:**
- Create: `frontend/app/math-learning/visual-presentation.ts`
- Modify: `frontend/app/math-learning/validation.ts`
- Modify: `frontend/tests/math_knowledge_pack.test.mjs`
- Test: `frontend/tests/math_visual_presentation.test.mjs`

**Interfaces:**
- Produces: `createVisualPresentation(question): VisualPresentation | null`
- Produces: `validateKnowledgePackage(pack): string[]`

- [ ] **Step 1: 写出失败测试**：断言圆柱题生成 `mode: "preview"`、`section: "shapes"`、`solid: "cylinder"`；圆柱截面题生成 `section: "cut"`、`solid: "cylinder"`、`planePreset: "parallel-base"`；无图题返回 `null`；未知图形参数被拒绝。
- [ ] **Step 2: 运行失败测试**：执行 `node --test tests/math_visual_presentation.test.mjs`，确认因模块不存在而失败。
- [ ] **Step 3: 最小实现**：建立白名单映射和校验函数；`solid-model`、`folding-net`、`cross-section`、`orthographic-view` 均输出稳定的查询参数。
- [ ] **Step 4: 运行通过测试**：执行 `node --test tests/math_visual_presentation.test.mjs tests/math_knowledge_pack.test.mjs`，确认通过。

### Task 2: 互动课件按题目展示并区分预览/挑战

**Files:**
- Modify: `frontend/app/components/math_interaction_question.tsx`
- Modify: `frontend/public/interactive-lessons/sims/chapter1-shapes-world.html`
- Test: `frontend/tests/math_interaction_message.test.mjs`
- Test: `frontend/tests/math_visual_presentation.test.mjs`

**Interfaces:**
- Consumes: `VisualPresentation`
- Produces: iframe 参数 `mode=preview|challenge`、`solid`、`planePreset`、`netId`、`structureId`、`view`。

- [ ] **Step 1: 写出失败测试**：断言预览 URL 包含 `mode=preview&solid=cylinder`，互动 URL 包含 `mode=challenge&challenge=solid-cube-parts`，且 HTML 包含预览模式隐藏挑战区与按 `solid` 初始化模型的逻辑。
- [ ] **Step 2: 运行失败测试**：执行 `node --test tests/math_visual_presentation.test.mjs`，确认因 URL 和课件处理缺失而失败。
- [ ] **Step 3: 最小实现**：组件以题目展示描述构建 URL；HTML 在预览模式隐藏挑战、操作说明和课件内部题，按图形参数加载正确模型；截面场景根据实体与切面预设渲染对应说明和结果。
- [ ] **Step 4: 运行通过测试**：执行 `node --test tests/math_visual_presentation.test.mjs tests/math_interaction_message.test.mjs`，确认通过。

### Task 3: 测试页面消除重复作答

**Files:**
- Modify: `frontend/app/components/math_question_renderer.tsx`
- Modify: `frontend/app/components/math_learning_workspace.tsx`
- Test: `frontend/tests/math_learning_workspace.test.mjs`

**Interfaces:**
- Consumes: `createVisualPresentation(question)`。
- Produces: 普通题只显示辅助预览与外层答案；互动题只显示互动挑战与外层下一题导航。

- [ ] **Step 1: 写出失败测试**：断言普通图形题渲染为预览而非挑战，互动题完成后不会再生成第二组相同选项。
- [ ] **Step 2: 运行失败测试**：执行 `node --test tests/math_learning_workspace.test.mjs`，确认旧行为无法满足断言。
- [ ] **Step 3: 最小实现**：普通题仅向 `MathInteractionQuestion` 传递预览模式；互动题的成功事件仅设置答案，外层按钮文案明确为“进入下一题”。
- [ ] **Step 4: 运行通过测试**：执行 `node --test tests/math_learning_workspace.test.mjs tests/math_visual_presentation.test.mjs`，确认通过。

### Task 4: 当前支持课程的真实选择器

**Files:**
- Create: `frontend/app/math-learning/course-catalog.ts`
- Modify: `frontend/app/components/math_learning_workspace.tsx`
- Test: `frontend/tests/math_course_catalog.test.mjs`

**Interfaces:**
- Produces: `getAvailableCourses(packages): CourseCatalog`
- Consumes: `chapter1ShapePackages`

- [ ] **Step 1: 写出失败测试**：断言目录只含已导入的北师大版七年级上册第一章，按教材、册别、章节返回 4 个知识点，且不会返回未导入学科或章节。
- [ ] **Step 2: 运行失败测试**：执行 `node --test tests/math_course_catalog.test.mjs`，确认因目录模块不存在而失败。
- [ ] **Step 3: 最小实现**：从能力包元数据构建课程目录；选择页增加教材、册别、章节下拉框，联动过滤知识点并显示“当前已支持课程范围”。
- [ ] **Step 4: 运行通过测试**：执行 `node --test tests/math_course_catalog.test.mjs tests/math_learning_workspace.test.mjs`，确认通过。

### Task 5: 全量回归与浏览器验收

**Files:**
- Modify: `docs/互动课件重做_自检与验收清单_V1.0.md`

- [ ] **Step 1: 运行全量前端测试**：执行 `node --test tests/*.test.mjs`，确认所有测试通过。
- [ ] **Step 2: 运行类型检查与构建**：执行 `pnpm type-check` 和 `pnpm build`，确认无类型或构建错误。
- [ ] **Step 3: 浏览器验收**：访问“今天要做”，分别检查圆柱、球、圆锥、正方体和圆柱截面题；确认模型与题干一致、普通题无内部挑战、互动题可完成。
- [ ] **Step 4: 更新验收清单**：记录本轮映射校验、重复作答和课程范围选择的验证结果。
