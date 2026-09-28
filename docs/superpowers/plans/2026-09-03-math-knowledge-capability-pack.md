# 数学知识点能力包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复现有数学互动课件的真实入口，并为北师大版七年级上册第一章建立可完成“10题诊断、互动学习、变式再测、98分过关”的知识点能力包。

**Architecture:** 以前端纯数据能力包和会话状态机驱动学习流程，现有 HTML/Three.js 课件作为受控互动渲染器，通过同源 `postMessage` 返回结果。后端只负责使用临时模型会话生成受限 JSON 变式题，所有 AI 结果必须经过白名单和确定性校验，失败时回退本地题库。

**Tech Stack:** Next.js 15、React 19、TypeScript、Three.js 0.185、Node.js test runner、FastAPI、Pydantic、Python unittest/pytest 兼容测试。

**Spec:** `docs/superpowers/specs/2026-09-03-math-knowledge-capability-pack-design.md`

## Global Constraints

- 保留所有现有互动课件文件和课程卡片。
- 第一章四个知识点每个至少 10 个本地已校验任务，且至少覆盖 4 种作答方式。
- 需要看图的题必须提供可渲染的 `visual`，不得只出现“如下图”。
- 立体图形复用项目已有的本地 Three.js，不使用模型生成图片或可执行代码。
- 前端纯逻辑测试使用当前 Node.js 24 对无 JSX `.ts` 文件的原生类型擦除能力，不引入测试运行器依赖。
- 98 分及以上不得显示“需巩固”“未理解”或“主要问题”。
- 模型未配置、超时、限流、返回非法数据时必须回退本地题库。
- 不新增第三方依赖，不修改 `.env`，不保存或输出 API Key。
- 当前工作区没有 Git 仓库；每个任务以测试通过的变更检查点结束，不自动提交 Git。

---

## File Structure

### 新建

- `frontend/app/math-learning/types.ts`：题目、图形、能力包、会话和诊断类型。
- `frontend/app/math-learning/chapter1-shapes-pack.ts`：第一章四个能力包及 40 题以上本地题库。
- `frontend/app/math-learning/validation.ts`：题库、图形参数和 AI 题校验。
- `frontend/app/math-learning/session-engine.ts`：组卷、计分、诊断、轮次和队列纯函数。
- `frontend/app/math-learning/storage.ts`：本机学习会话持久化适配器。
- `frontend/app/components/math_learning_workspace.tsx`：一步一屏学习工作台。
- `frontend/app/components/math_question_renderer.tsx`：普通题与互动图形题路由组件。
- `frontend/app/components/math_interaction_question.tsx`：iframe 互动题及同源消息校验。
- `frontend/app/today-learning/page.tsx`：学生今日数学学习入口。
- `frontend/app/api/admin/math-question-generation-test/route.ts`：前端同源代理。
- `frontend/tests/math_knowledge_pack.test.mjs`：能力包完整性测试。
- `frontend/tests/math_learning_session.test.mjs`：会话、评分和诊断测试。
- `frontend/tests/math_interaction_message.test.mjs`：互动消息安全测试。
- `backend/app/schemas/math_question_generation.py`：AI 变式题请求与响应模型。
- `backend/app/services/math_question_generation_service.py`：提示词、解析、白名单和回退所需错误类型。
- `backend/tests/test_math_question_generation_service.py`：AI 生成服务测试。

### 修改

- `frontend/app/interactive-lessons/lesson-catalog.ts`：恢复实际 HTML 课件映射。
- `frontend/public/interactive-lessons/sims/chapter1-shapes-world.html`：支持知识点、难度参数和结构化完成事件。
- `frontend/app/components/student_dashboard.tsx`：主行动进入今日学习选择页。
- `frontend/app/workspace-data.ts`：加入“今日学习”入口并保持现有导航文字体系。
- `frontend/app/globals.css`：新增学习工作台明亮模式样式。
- `backend/app/services/model_connection_test_service.py`：提供受控 JSON completion 调用入口。
- `backend/app/api/routes/model_test.py`：增加调试阶段变式题接口。

---

### Task 1: 恢复现有数学专用课件映射

**Files:**
- Modify: `frontend/tests/interactive_lesson_catalog.test.mjs`
- Modify: `frontend/app/interactive-lessons/lesson-catalog.ts`

**Interfaces:**
- Consumes: `localLesson(..., legacyAsset, ...)`
- Produces: `getLessonRoute(id: string, legacyAsset: string): string`

- [ ] **Step 1: 写入失败测试**

在 `interactive_lesson_catalog.test.mjs` 中读取目录源代码和 `sims` 文件夹，断言：

```js
test("带 html 文件名的课程恢复到专用自研课件", () => {
  const expected = [
    "chapter1-shapes-world.html",
    "chapter2-integers.html",
    "chapter3-algebra.html",
    "chapter4-plane-figures.html",
    "chapter6-data-statistics.html",
    "chapter7-2-parallel-lines.html",
    "chapter7-4-triangle.html"
  ];
  for (const asset of expected) {
    assert.equal(catalogSource.includes(`_legacyAsset.endsWith(".html")`), true);
    assert.equal(fs.existsSync(new URL(`../public/interactive-lessons/sims/${asset}`, import.meta.url)), true);
  }
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `cd frontend && node --test tests/interactive_lesson_catalog.test.mjs`

Expected: FAIL，因为目录当前忽略 `_legacyAsset`。

- [ ] **Step 3: 实现最小映射规则**

将路由函数调整为：

```ts
function getLessonRoute(id: string, legacyAsset: string) {
  if (lessonRoutes[id]) return lessonRoutes[id];
  if (legacyAsset.endsWith(".html")) {
    return `/interactive-lessons/sims/${legacyAsset}`;
  }
  return `/interactive-lessons/sims/concept-studio.html?lesson=${id}`;
}
```

并让 `localLesson` 将 `_legacyAsset` 政名为 `legacyAsset` 后传入该函数。

- [ ] **Step 4: 运行目录测试和现有互动测试**

Run: `cd frontend && node --test tests/interactive_lesson_catalog.test.mjs tests/interactive_lesson_quality.test.mjs`

Expected: PASS。

- [ ] **Step 5: 记录变更检查点**

确认仅修改目录映射和对应测试，不删除任何 `sims` 文件。

---

### Task 2: 建立能力包和题目类型

**Files:**
- Create: `frontend/app/math-learning/types.ts`
- Create: `frontend/app/math-learning/validation.ts`
- Create: `frontend/tests/math_knowledge_pack.test.mjs`

**Interfaces:**
- Produces: `MathQuestion`、`MathVisualSpec`、`MathKnowledgePackage`、`validateQuestion()`、`validateKnowledgePackage()`

- [ ] **Step 1: 写入验证器失败测试**

测试必须覆盖：缺少图形的“如下图”题被拒绝、答案不在选项中被拒绝、非法 renderer 被拒绝、少于 10 题的能力包被拒绝。

```js
test("看图题没有 visual 时校验失败", () => {
  const result = model.validateQuestion({
    id: "bad-visual",
    prompt: "观察如下图选择答案",
    responseType: "single-choice",
    options: [{ id: "a", text: "A" }],
    correctAnswer: "a"
  });
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_knowledge_pack.test.mjs`

Expected: FAIL，因为类型和验证器尚不存在。

- [ ] **Step 3: 实现稳定类型和纯验证函数**

严格使用规格中的联合类型；验证器返回：

```ts
type ValidationResult = { ok: true } | { ok: false; errors: string[] };
```

验证函数保持无浏览器依赖，使 Node.js 24 测试可以直接导入 `validation.ts`。

- [ ] **Step 4: 运行验证测试**

Run: `cd frontend && node --test tests/math_knowledge_pack.test.mjs`

Expected: PASS。

- [ ] **Step 5: 记录变更检查点**

检查类型名称与设计规格完全一致，没有使用 `any` 绕过校验。

---

### Task 3: 完成第一章四个能力包和 40 题以上本地题库

**Files:**
- Create: `frontend/app/math-learning/chapter1-shapes-pack.ts`
- Modify: `frontend/tests/math_knowledge_pack.test.mjs`

**Interfaces:**
- Consumes: `MathKnowledgePackage`、`validateKnowledgePackage()`
- Produces: `chapter1ShapePackages`、`getMathKnowledgePackage(id)`

- [ ] **Step 1: 增加题库完整性失败测试**

```js
test("第一章四个知识点均有至少10个有效任务和4种作答方式", () => {
  assert.equal(packs.length, 4);
  for (const pack of packs) {
    assert.ok(pack.questions.length >= 10);
    assert.ok(new Set(pack.questions.map(q => q.responseType)).size >= 4);
    assert.deepEqual(model.validateKnowledgePackage(pack), { ok: true });
  }
});
```

另外断言四个固定 ID：

```js
[
  "g7u-shapes-solid",
  "g7u-shapes-folding",
  "g7u-shapes-section",
  "g7u-shapes-views"
]
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_knowledge_pack.test.mjs`

Expected: FAIL，因为能力包数据尚不存在。

- [ ] **Step 3: 写入四个能力包**

每包至少包含：

- 4 道 `single-choice`
- 2 道 `true-false`
- 2 道 `multi-choice`
- 2 道 `interactive`

互动题分别使用 `solid-model`、`folding-net`、`cross-section`、`orthographic-view`。每道题必须填写唯一 ID、能力标签、难度、答案、解析和来源。

- [ ] **Step 4: 增加内容一致性断言**

断言每个题目 `knowledgePointId` 与所属能力包一致，所有 `source` 为 `local-reviewed`，每包基础、进阶、挑战至少各有一题。

- [ ] **Step 5: 运行题库测试**

Run: `cd frontend && node --test tests/math_knowledge_pack.test.mjs`

Expected: PASS，题目总数不少于 40。

- [ ] **Step 6: 记录变更检查点**

人工复核所有题干、正确答案、解析和图形参数，特别检查正方体截面、相对面和三视图题。

---

### Task 4: 建立学习会话、组卷、评分和诊断引擎

**Files:**
- Create: `frontend/app/math-learning/session-engine.ts`
- Create: `frontend/app/math-learning/storage.ts`
- Create: `frontend/tests/math_learning_session.test.mjs`

**Interfaces:**
- Produces: `createSession()`、`getCurrentKnowledgePointId()`、`recordAnswer()`、`scoreRound()`、`buildDiagnosis()`、`advanceSession()`、`saveSession()`、`loadSession()`

- [ ] **Step 1: 写入状态机失败测试**

覆盖以下行为：

```js
test("多个知识点按选择顺序逐个学习", () => {
  const session = model.createSession(["g7u-shapes-solid", "g7u-shapes-folding"], "2026-09-03");
  assert.equal(model.getCurrentKnowledgePointId(session), "g7u-shapes-solid");
});

test("100分诊断不产生薄弱项或主要问题", () => {
  const result = model.buildDiagnosis(allCorrectAttempts);
  assert.equal(result.score, 100);
  assert.deepEqual(result.weakTags, []);
  assert.equal(result.primaryIssue, null);
});
```

同时测试 60% 边界、98 分过关、三轮后 `needs-help`、无效图形题补题和刷新恢复。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_learning_session.test.mjs`

Expected: FAIL，因为状态引擎尚不存在。

- [ ] **Step 3: 实现纯函数状态机**

所有状态转换返回新对象，不直接修改入参。诊断依据题目的 `capabilityTag` 聚合，不写固定评价文案。

- [ ] **Step 4: 实现 localStorage 适配器**

存储键使用 `math-learning-session-v1:<localDate>`，解析失败返回 `null`，不覆盖其他学习进度键。

- [ ] **Step 5: 运行会话测试**

Run: `cd frontend && node --test tests/math_learning_session.test.mjs`

Expected: PASS。

- [ ] **Step 6: 记录变更检查点**

确认 100 分、98 分边界、多知识点队列和三轮上限均有回归测试。

---

### Task 5: 让第一章课件支持知识点直达和互动题结果

**Files:**
- Create: `frontend/tests/math_interaction_message.test.mjs`
- Modify: `frontend/public/interactive-lessons/sims/chapter1-shapes-world.html`
- Modify: `frontend/app/interactive-lesson-message.ts`

**Interfaces:**
- Consumes: `section`、`difficulty` URL 参数
- Produces: `InteractionResultMessage`、`isMathInteractionResultMessage()`

- [ ] **Step 1: 写入消息验证失败测试**

断言正确同源消息通过，错误来源、未知 section、未知 difficulty、缺少 challengeId、非布尔 passed 均被拒绝。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_interaction_message.test.mjs`

Expected: FAIL，因为验证函数尚不存在。

- [ ] **Step 3: 实现 URL 参数初始化**

页面加载时读取 `section` 和 `difficulty`，只接受白名单值；非法值回落到 `shapes/basic`。调用现有 `switchSection()`，不复制 Three.js 场景。

- [ ] **Step 4: 实现结构化完成事件**

学生完成当前微挑战时发送规格中的 `math-interaction-result` 消息，保留现有 `interactive-lesson-complete` 消息以兼容旧播放器。

- [ ] **Step 5: 实现父页面消息验证函数**

`isMathInteractionResultMessage(origin, expectedOrigin, data, expectedKnowledgePointId)` 必须进行同源、字段和枚举校验。

- [ ] **Step 6: 运行互动消息与旧消息测试**

Run: `cd frontend && node --test tests/math_interaction_message.test.mjs tests/interactive_lesson_message.test.mjs`

Expected: PASS。

- [ ] **Step 7: 记录变更检查点**

确认旧互动教学页面仍能收到原完成消息，新工作台能收到细粒度知识点结果。

---

### Task 6: 建立一步一屏数学学习工作台

**Files:**
- Create: `frontend/app/components/math_question_renderer.tsx`
- Create: `frontend/app/components/math_interaction_question.tsx`
- Create: `frontend/app/components/math_learning_workspace.tsx`
- Create: `frontend/app/today-learning/page.tsx`
- Modify: `frontend/app/globals.css`
- Create: `frontend/tests/math_learning_workspace.test.mjs`

**Interfaces:**
- Consumes: `chapter1ShapePackages`、会话引擎、互动消息验证器
- Produces: `/today-learning` 完整学生流程

- [ ] **Step 1: 写入页面结构失败测试**

源码测试断言页面具备“选择内容、首次测试、查看诊断、针对学习、过关测试”五步；工作台不得同时渲染多个 phase 主区域。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_learning_workspace.test.mjs`

Expected: FAIL，因为页面和组件尚不存在。

- [ ] **Step 3: 实现教材和知识点选择**

第一批只启用数学、北师大版、七年级上册、第一章真实能力包；其他已上传教材显示可选择入口但不伪造未解析目录。多选结果按点击顺序写入会话。

- [ ] **Step 4: 实现普通题渲染器**

支持 `single-choice`、`true-false`、`multi-choice`，选择状态立即可见；当前题作答后才允许进入下一题。

- [ ] **Step 5: 实现互动图形题渲染器**

根据 `visual.kind` 构造第一章课件 iframe URL；未收到通过消息前不能计为正确。加载超时显示“重新加载图形”和“更换备用题”。

- [ ] **Step 6: 实现动态诊断页**

分数、能力条和主要问题全部来自 `buildDiagnosis()`。过关时隐藏主要问题并显示“进入下一个知识点”或“完成今日学习”。

- [ ] **Step 7: 实现针对学习和再测**

仅打开薄弱标签对应 section；完成互动后进入 10 题变式测试。第三轮仍未过关进入 `needs-help`。

- [ ] **Step 8: 增加明亮响应式样式**

桌面端保持单主任务区，手机端使用单列，底部固定唯一主按钮。按钮使用蓝、绿、黄、珊瑚色区分状态，正文对比度不低于现有页面。

- [ ] **Step 9: 运行工作台测试和类型检查**

Run: `cd frontend && node --test tests/math_learning_workspace.test.mjs && npm run type-check`

Expected: PASS。

- [ ] **Step 10: 记录变更检查点**

确认刷新后恢复当前知识点、当前轮次和已回答题目，且不会污染旧任务进度。

---

### Task 7: 建立后端 AI 变式题服务

**Files:**
- Create: `backend/app/schemas/math_question_generation.py`
- Create: `backend/app/services/math_question_generation_service.py`
- Create: `backend/tests/test_math_question_generation_service.py`
- Modify: `backend/app/services/model_connection_test_service.py`
- Modify: `backend/app/api/routes/model_test.py`

**Interfaces:**
- Consumes: `ModelTestSession`、`ModelConnectionTestService.request_json_completion()`
- Produces: `POST /api/v1/admin/math-question-generation-test`

- [ ] **Step 1: 写入服务失败测试**

使用注入的假 completion 响应覆盖：合法题通过、Markdown 围栏 JSON 被拒绝、未知 visual kind 被拒绝、答案不在选项中被拒绝、重复题被拒绝。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && python -m unittest tests.test_math_question_generation_service -v`

Expected: FAIL，因为 schema 和 service 尚不存在。

- [ ] **Step 3: 建立 Pydantic 请求与响应模型**

请求字段限定 `knowledge_point_id`、`capability_tag`、`difficulty`、`response_type`、`excluded_question_ids`、`weakness_reason`；所有字符串设置长度上限，枚举使用 `Literal`。

- [ ] **Step 4: 提取受控 JSON completion**

在 `ModelConnectionTestService` 增加内部可复用方法，仍使用现有 HTTPS、超时和鉴权错误处理；不记录 prompt 中的密钥。

- [ ] **Step 5: 实现生成与校验服务**

系统提示明确禁止输出代码和未声明字段，温度保持 `0.2`。解析后执行 schema、白名单、答案引用和重复 ID 检查。

- [ ] **Step 6: 增加 API 路由**

复用 `X-Model-Test-Session`，无有效会话返回 401；仅开发环境启用；校验失败返回可理解的 400 错误，不返回模型原始内容。

- [ ] **Step 7: 运行后端测试**

Run: `cd backend && python -m unittest discover -s tests -v`

Expected: PASS。

- [ ] **Step 8: 记录变更检查点**

确认日志、异常和响应中不包含 API Key 或模型原始敏感字段。

---

### Task 8: 接入前端 AI 变式题并实现本地回退

**Files:**
- Create: `frontend/app/api/admin/math-question-generation-test/route.ts`
- Create: `frontend/app/math-learning/ai-question-client.ts`
- Modify: `frontend/app/components/math_learning_workspace.tsx`
- Modify: `frontend/tests/math_learning_session.test.mjs`

**Interfaces:**
- Produces: `generateValidatedVariantQuestion(request, fallbackQuestion)`

- [ ] **Step 1: 写入回退失败测试**

测试网络失败、401、500、非法 JSON、重复题和不可渲染 visual 均返回指定本地备用题，并返回 `fallbackReason` 供管理员诊断。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/math_learning_session.test.mjs`

Expected: FAIL，因为客户端和回退函数尚不存在。

- [ ] **Step 3: 实现 Next.js 同源代理**

代理只转发允许字段和 `X-Model-Test-Session`，统一将后端不可用转换为可识别错误；不将 API Key 放进请求体。

- [ ] **Step 4: 实现 AI 题客户端和二次校验**

后端成功响应仍需经过前端 `validateQuestion()`；失败时立即使用同知识点、同难度的未使用本地题。

- [ ] **Step 5: 接入第二轮和第三轮组卷**

首次诊断只用本地已审核题；再测优先请求 AI 变式题，数量不足时用本地变式题补满 10 题。

- [ ] **Step 6: 运行前端会话测试**

Run: `cd frontend && node --test tests/math_learning_session.test.mjs tests/math_knowledge_pack.test.mjs`

Expected: PASS。

- [ ] **Step 7: 记录变更检查点**

断开模型服务后手工确认学习流程仍可从选择走到评分和过关。

---

### Task 9: 接入学生首页和导航

**Files:**
- Modify: `frontend/app/components/student_dashboard.tsx`
- Modify: `frontend/app/workspace-data.ts`
- Modify: `frontend/tests/workspace_navigation_model.test.mjs`

**Interfaces:**
- Produces: 学生首页唯一主按钮进入 `/today-learning`

- [ ] **Step 1: 写入导航失败测试**

断言首页主行动和“今天要做”导航均指向 `/today-learning`，现有互动教学独立入口仍保留。

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd frontend && node --test tests/workspace_navigation_model.test.mjs`

Expected: FAIL，因为新入口尚未接入。

- [ ] **Step 3: 修改首页主行动与导航**

首页文案改为“选择今天老师讲的内容”，按钮为“开始今日学习”；侧栏保留“互动教学”作为自由探索入口。

- [ ] **Step 4: 运行导航测试和类型检查**

Run: `cd frontend && node --test tests/workspace_navigation_model.test.mjs && npm run type-check`

Expected: PASS。

- [ ] **Step 5: 记录变更检查点**

确认旧 `/tasks`、`/interactive-lessons`、`/reports` 页面仍可访问。

---

### Task 10: 完整回归和浏览器验收

**Files:**
- Modify: `docs/互动课件重做_自检与验收清单_V1.0.md`

**Interfaces:**
- Consumes: 前九项全部产物
- Produces: 可由用户逐项验收的结果记录

- [ ] **Step 1: 运行全部前端测试**

Run: `cd frontend && node --test tests/*.test.mjs`

Expected: 全部 PASS，无未处理异常。

- [ ] **Step 2: 运行类型检查和生产构建**

Run: `cd frontend && npm run type-check && npm run build`

Expected: 两项均成功。

- [ ] **Step 3: 运行全部后端测试**

Run: `cd backend && python -m unittest discover -s tests -v`

Expected: 全部 PASS。

- [ ] **Step 4: 启动现有前后端调试服务**

前端沿用可用端口 3002，后端沿用 8000/8001 的现有开发配置；如果端口已被项目进程占用，复用现有服务，不终止无关进程。

- [ ] **Step 5: 桌面端完整流程验收**

在学生实际使用的浏览器中完成：选择四个知识点、每点 10 题、图形操作、100 分无薄弱项、错题进入针对学习、再测、队列进入下一知识点。

- [ ] **Step 6: 手机端完整流程验收**

检查 390×844 视口：无横向滚动、图形可触控旋转、主按钮可见、目录不占满首屏、文本和选项不重叠。

- [ ] **Step 7: 故障回退验收**

关闭模型测试服务后完成一次再测，确认使用本地题库；模拟图形加载失败，确认题目不计分并能更换备用题。

- [ ] **Step 8: 更新自检清单**

在验收清单中记录每项结果、测试命令、通过时间和仍存在的限制，不写“已完成”但没有证据。

- [ ] **Step 9: 最终变更检查点**

检查不存在 API Key、临时调试输出、无效占位内容和被误删的旧课件文件，然后交付用户验收。
