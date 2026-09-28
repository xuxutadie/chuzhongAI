# 学生学习工作台框架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将学生端升级为含侧边栏、状态栏、多页面入口和学习仪表盘的工作台框架。

**Architecture:** 使用现有 App Router 页面目录提供独立路由，`StudentPageShell` 承担全局工作台布局，`StudentNav` 根据集中导航配置渲染分组入口，页面组件只负责各自内容。展示数据保留在前端适配层，后续可按相同字段替换为后端 API 数据。

**Tech Stack:** Next.js 15、React 19、TypeScript、现有 Three.js 粒子背景、Node.js 内置测试。

---

## 文件职责

- `frontend/app/components/workspace_navigation_model.js`：可测试的导航路径配置。
- `frontend/app/components/workspace_navigation_model.d.ts`：导航配置的 TypeScript 声明。
- `frontend/tests/workspace_navigation_model.test.mjs`：导航覆盖与路径唯一性测试。
- `frontend/app/workspace-data.ts`：仪表盘、学科、错题与资料演示数据。
- `frontend/app/components/student_nav.tsx`：分组侧边导航与移动端导航。
- `frontend/app/components/student_page_shell.tsx`：工作台壳、顶部状态栏和内容区。
- `frontend/app/components/student_dashboard.tsx`：学习仪表盘内容。
- `frontend/app/components/workbench_placeholder_page.tsx`：学科、错题、资料、练习等框架页面复用内容。
- `frontend/app/subjects/page.tsx`、`wrong-questions/page.tsx`、`materials/page.tsx`、`practice/page.tsx`：新增路由页。
- `frontend/app/globals.css`：桌面和移动端工作台布局。

### Task 1: 定义并验证导航模型

**Files:**
- Create: `frontend/tests/workspace_navigation_model.test.mjs`
- Create: `frontend/app/components/workspace_navigation_model.js`
- Create: `frontend/app/components/workspace_navigation_model.d.ts`

- [x] **Step 1: 写失败测试，锁定十一个可访问工作台入口**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { workspaceNavigationGroups } from "../app/components/workspace_navigation_model.js";

test("工作台导航覆盖学习总览、学科、工具和 AI 教练", () => {
  const items = workspaceNavigationGroups.flatMap((group) => group.items);
  assert.equal(items.length, 11);
  assert.equal(new Set(items.map((item) => item.href)).size, 10);
  assert.deepEqual(items.map((item) => item.href), [
    "/dashboard", "/profile", "/reports", "/subjects/math", "/subjects/english",
    "/subjects/chinese", "/tasks", "/practice", "/wrong-questions", "/materials", "/assistant"
  ]);
});
```

- [x] **Step 2: 运行测试并确认因模型不存在失败**

Run: `node --test tests/workspace_navigation_model.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND`。

- [x] **Step 3: 创建包含十一项入口的完整导航模型**

```js
export const workspaceNavigationGroups = [
  { label: "学习总览", items: [{ href: "/dashboard", label: "仪表盘" }] },
  { label: "学科学习", items: [{ href: "/subjects/math", label: "数学" }] },
  { label: "学习工具", items: [{ href: "/tasks", label: "今日任务" }] },
  { label: "AI 教练", items: [{ href: "/assistant", label: "教师式答疑" }] }
];
```

- [x] **Step 4: 验证十一项导航模型通过**

Run: `node --test tests/workspace_navigation_model.test.mjs`

Expected: `pass 1`。

### Task 2: 构建共享工作台壳和仪表盘

**Files:**
- Create: `frontend/app/workspace-data.ts`
- Modify: `frontend/app/components/student_nav.tsx`
- Modify: `frontend/app/components/student_page_shell.tsx`
- Modify: `frontend/app/components/student_dashboard.tsx`
- Modify: `frontend/app/dashboard/page.tsx`
- Modify: `frontend/app/globals.css`

- [x] **Step 1: 写入导航模型测试，验证每组均有标题和项目**

```js
test("每个导航分组均包含可见标题和至少一个入口", () => {
  for (const group of workspaceNavigationGroups) {
    assert.ok(group.label.length > 0);
    assert.ok(group.items.length > 0);
  }
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/workspace_navigation_model.test.mjs`

Expected: 失败原因是新增断言尚未满足。

- [x] **Step 3: 实现工作台组件与数据适配层**

```tsx
<main className="student-workbench">
  <StudentNav />
  <section className="workbench-main">
    <StudentWorkspaceHeader />
    <div className="workbench-content">{children}</div>
  </section>
</main>
```

- [x] **Step 4: 重组首页为任务、学科、错题、AI 建议、成长趋势五块内容**

Run: `pnpm run type-check`

Expected: 无 TypeScript 错误。

### Task 3: 新增框架页面与响应式验证

**Files:**
- Create: `frontend/app/components/workbench_placeholder_page.tsx`
- Create: `frontend/app/subjects/page.tsx`
- Create: `frontend/app/subjects/math/page.tsx`
- Create: `frontend/app/subjects/english/page.tsx`
- Create: `frontend/app/subjects/chinese/page.tsx`
- Create: `frontend/app/wrong-questions/page.tsx`
- Create: `frontend/app/materials/page.tsx`
- Create: `frontend/app/practice/page.tsx`
- Modify: `frontend/app/profile/page.tsx`
- Modify: `frontend/app/tasks/page.tsx`
- Modify: `frontend/app/assistant/page.tsx`
- Modify: `frontend/app/reports/page.tsx`
- Modify: `frontend/app/globals.css`

- [x] **Step 1: 新增导航模型测试，验证所有目标路径唯一且以 `/` 开头**

```js
test("所有导航路径都是唯一的绝对路径", () => {
  const paths = workspaceNavigationGroups.flatMap((group) => group.items.map((item) => item.href));
  assert.ok(paths.every((path) => path.startsWith("/")));
  assert.equal(paths.length, new Set(paths).size);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/workspace_navigation_model.test.mjs`

Expected: 失败原因是目标路由尚未全部被配置。

- [x] **Step 3: 创建独立路由和可复用框架页**

```tsx
export default function WrongQuestionsPage() {
  return (
    <StudentPageShell title="错题本" description="按学科整理需要复盘的错误。">
      <WorkbenchPlaceholderPage section="错题本" items={wrongQuestionSummaries} />
    </StudentPageShell>
  );
}
```

- [x] **Step 4: 在桌面和移动端验证页面可访问、文字不溢出、导航正确高亮**

Run: `pnpm run type-check && node --test tests/star_orbit_model.test.mjs tests/workspace_navigation_model.test.mjs`

Expected: 全部通过。

## 自检结果

- 覆盖范围：工作台壳、分组导航、仪表盘、新路由、响应式布局和自动测试均有对应任务。
- 约束：不新增依赖，不修改后端接口和数据库结构，不实现真实题库、OCR、上传或 AI 推理。
- 版本控制：当前工作区不是 Git 仓库，不执行提交操作。
