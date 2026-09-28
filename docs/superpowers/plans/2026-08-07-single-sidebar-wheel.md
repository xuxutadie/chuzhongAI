# 单一侧栏导航轮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个连续导航轮替换现有四个分组导航轮。

**Architecture:** 由纯函数将现有分组数据展开为“分隔标记或链接”两种轨道项；单一客户端组件维护唯一焦点并渲染所有项。移动端继续复用链接数据但采用扁平横向布局。

**Tech Stack:** Next.js App Router、React、TypeScript、CSS、Node.js 测试运行器。

---

### Task 1: 验证展开后的轨道顺序

**Files:**
- Create: `frontend/app/components/single_navigation_wheel_model.js`
- Create: `frontend/app/components/single_navigation_wheel_model.d.ts`
- Create: `frontend/tests/single_navigation_wheel_model.test.mjs`

- [x] 先写失败测试，断言展开结果包含 4 个分隔标记、11 个链接，并保持“学习总览 -> 仪表盘”和“AI 教练 -> 教师式答疑”的顺序。
- [x] 运行 `node --test tests/single_navigation_wheel_model.test.mjs`，确认模块缺失而失败。
- [x] 实现 `createNavigationWheelItems(groups)`，按每个分组先标记、后链接的顺序返回轨道项。
- [x] 再次运行测试，确认通过。

### Task 2: 用一个组件替换分组组件

**Files:**
- Create: `frontend/app/components/single_navigation_wheel.tsx`
- Modify: `frontend/app/components/student_nav.tsx`
- Delete: `frontend/app/components/curved_navigation_group.tsx`

- [x] 使用展开后的轨道项建立唯一焦点，初始焦点定位到当前路由。
- [x] 将滚轮、拖拽和键盘上下键绑定到同一个轨道容器。
- [x] 分隔标记只显示文字；链接沿用 `Link` 和原有中文按钮文字。
- [x] 在 `StudentNav` 中只渲染一个 `SingleNavigationWheel`。

### Task 3: 调整单轨样式和手机端回退

**Files:**
- Modify: `frontend/app/globals.css`

- [x] 删除分组式导航轮的高度和样式。
- [x] 新增单轨容器，令焦点项位于侧栏中部并对邻近项应用弧线、透明度和虚化。
- [x] 在 760px 以下取消定位和动画，恢复紧凑横向入口列表。

### Task 4: 验证

**Files:**
- Verify: `frontend/tests/single_navigation_wheel_model.test.mjs`
- Verify: `frontend/tests/workspace_navigation_model.test.mjs`

- [x] 运行 `node --test tests/single_navigation_wheel_model.test.mjs tests/workspace_navigation_model.test.mjs`。
- [x] 运行 `pnpm run type-check`。
- [x] 在 1440px 和 390px 宽度检查单一轨道、路由跳转、当前页高亮、拖拽和控制台错误。
