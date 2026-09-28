# Student Daily Learning Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立统一、可持久化、按顺序解锁的每日学习闭环，并将学生端统一改为明亮模式。

**Architecture:** 使用纯函数进度模型负责顺序与完成率，React Context 负责跨页面共享并通过本机存储持久化。任务页面只消费统一状态；数学互动课件和新增的英语、语文任务工作台通过同一完成接口写回。

**Tech Stack:** Next.js 15、React 19、TypeScript、原生 CSS、Node test runner。

**Spec:** `docs/superpowers/specs/2026-09-02-student-daily-learning-loop-design.md`

## Global Constraints

- 不新增第三方依赖。
- 不修改现有 Agent API。
- 学生页面不出现开发占位语言。
- 使用明亮、多色、高对比度视觉。
- 后续任务必须由前置任务完成后解锁。

---

### Task 1: 统一学习进度模型

**Files:**
- Create: `frontend/app/learning-progress.ts`
- Create: `frontend/app/components/learning_progress_provider.tsx`
- Modify: `frontend/app/layout.tsx`
- Test: `frontend/tests/learning_progress.test.mjs`

- [ ] 先编写进度初始化、顺序解锁、开始任务、完成任务和日期重置测试。
- [ ] 运行测试并确认因模型文件不存在而失败。
- [ ] 实现纯函数模型和 Context 持久化适配器。
- [ ] 再次运行测试并确认通过。

### Task 2: 首页与今日任务闭环

**Files:**
- Modify: `frontend/app/components/student_dashboard.tsx`
- Modify: `frontend/app/tasks/page.tsx`
- Modify: `frontend/app/components/learning_task_card.tsx`
- Modify: `frontend/app/student-data.ts`

- [ ] 将首页改为单一当前任务入口和三项路线。
- [ ] 将任务卡改为当前可操作、后续锁定、完成后只读。
- [ ] 删除手动“完成这项”捷径，任务只能由学习内容完成。
- [ ] 验证跨页面返回后状态保持。

### Task 3: 补齐英语与语文任务

**Files:**
- Create: `frontend/app/task-activity-data.ts`
- Create: `frontend/app/components/guided_task_session.tsx`
- Create: `frontend/app/tasks/[taskId]/page.tsx`

- [ ] 定义英语和语文三步学习内容与自测答案。
- [ ] 实现逐步解锁、即时反馈和学习总结。
- [ ] 完成总结后写入统一任务进度并显示下一项入口。

### Task 4: 数学课件和报告同步

**Files:**
- Modify: `frontend/app/components/interactive_lesson_player.tsx`
- Modify: `frontend/app/components/growth_report.tsx`
- Modify: `frontend/app/reports/page.tsx`

- [ ] 数学课件提交反馈时完成对应今日任务。
- [ ] 日报告读取真实完成率和完成数量。
- [ ] 验证首页、任务页和报告数值一致。

### Task 5: 学生化文案与明亮模式

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/login/page.tsx`
- Modify: `frontend/app/practice/page.tsx`
- Modify: `frontend/app/wrong-questions/page.tsx`
- Modify: `frontend/app/workspace-data.ts`

- [ ] 替换全局颜色、表面、边框和输入框样式。
- [ ] 简化登录和学习工具文案，删除开发术语。
- [ ] 优化桌面与移动布局，保证当前目标和主按钮首屏可见。

### Task 6: 完整验证

**Files:**
- Verify: `frontend/app/**`

- [ ] 运行学习进度及现有 Node 测试。
- [ ] 运行 `pnpm type-check`。
- [ ] 运行 `pnpm build`。
- [ ] 在浏览器中验证登录、三项任务、报告同步和刷新持久化。
- [ ] 保存桌面与手机截图并逐张检查重叠、裁切和文字可读性。

