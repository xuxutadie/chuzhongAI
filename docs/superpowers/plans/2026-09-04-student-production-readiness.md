# 学生端真实可用闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将学生端从演示流程升级为可登录、可恢复、可持久化且可配置 AI/OCR 的真实学习闭环。

**Architecture:** 后端使用无新增依赖的 SQLite 仓储提供账号、会话、学生工作台、错题和配置边界；前端用同源代理与 HttpOnly Cookie 访问后端。学习状态统一收敛到工作台状态，图形失败通过等价题/文字路径处理，不再从评分分母移除。

**Tech Stack:** Next.js 15、React 19、TypeScript、FastAPI、Pydantic、Python sqlite3、现有 urllib。

**Spec:** `docs/superpowers/specs/2026-09-04-student-production-readiness-design.md`

**实施结果（2026-09-05）：** Task 1–6 已完成，最终状态与证据见 `.superpowers/sdd/student-production-readiness/progress.md` 及 `docs/学生端验收记录_2026-09-05.md`。下文保留最初任务切片；实现中改为仅接受服务端环境配置，教师页面只读取配置状态，不再提供浏览器临时密钥输入。真实外部 AI/OCR 联通与质量验证等待用户填写服务参数。

## Global Constraints

- 不新增第三方依赖，不修改现有 `.env`，只新增 `.env.example`。
- 所有生产逻辑先有失败测试；每个切片测试通过后再进入下一项。
- 所有 API Key 仅保留空白配置位或短时内存测试会话，绝不输出到日志、响应或仓库。
- 不自动提交 Git；当前目录不是 Git 仓库。

---

### Task 1: 修复学习评分与中断恢复基础

**Files:**
- Modify: `frontend/app/math-learning/session-engine.ts`, `frontend/app/math-learning/storage.ts`, `frontend/app/components/math_learning_workspace.tsx`
- Modify: `frontend/app/components/guided_task_session.tsx`, `frontend/app/components/interactive_lesson_player.tsx`
- Test: `frontend/tests/math_learning_session.test.mjs`, new recovery tests

- [ ] 写失败测试：无效题不能降低过关分母；本地存储异常安全降级；草稿恢复。
- [ ] 执行失败测试并确认失败原因。
- [ ] 实现评分完整性、备用题路径、存储错误提示与任务草稿恢复。
- [ ] 执行相关前端测试与类型检查。

### Task 2: 统一首页任务与学习流程

**Files:**
- Modify: `frontend/app/components/student_dashboard.tsx`, `frontend/app/components/learning_progress_provider.tsx`, `frontend/app/components/math_learning_workspace.tsx`
- Modify: `frontend/app/components/student_nav.tsx`, `frontend/app/globals.css`
- Test: `frontend/tests/learning_progress.test.mjs`, new workflow tests

- [ ] 写失败测试：首页进入当前任务；数学过关更新第一项任务；全部答错无法完成引导任务。
- [ ] 执行失败测试。
- [ ] 实现统一任务状态、移动导航和错误恢复文案。
- [ ] 执行相关前端测试与浏览器检查。

### Task 3: 建立 SQLite 学生账户与工作台后端

**Files:**
- Create: `backend/app/repositories/student_workspace_repository.py`
- Create: `backend/app/services/student_workspace_service.py`
- Create: `backend/app/api/routes/student_workspace.py`
- Modify: `backend/app/core/config.py`, `backend/app/main.py`, `backend/app/api/router.py`
- Test: new backend auth/workspace repository and API tests

- [x] 写失败测试：首次教师创建、学生登录、会话隔离、学生状态与错题隔离。
- [x] 执行失败测试。
- [x] 实现 SQLite 初始化、密码散列、会话令牌、角色检查、工作台状态与错题存储。
- [x] 执行后端测试与 API 冒烟检查。

### Task 4: 前端会话、同源代理与真实数据接入

**Files:**
- Create: `frontend/app/api/auth/*`, `frontend/app/api/student/*`, `frontend/app/student-api.ts`, `frontend/app/components/student_session_provider.tsx`
- Modify: `frontend/app/login/page.tsx`, `frontend/app/layout.tsx`, `frontend/app/components/student_page_shell.tsx`
- Modify: dashboard、任务、报告、错题和学习状态组件
- Test: new frontend session/API model tests

- [ ] 写失败测试：未登录重定向；账号隔离；刷新恢复服务端状态。
- [ ] 执行失败测试。
- [ ] 实现代理、Cookie、登录/首次教师设置、真实资料与工作台状态同步。
- [ ] 执行类型检查、构建和浏览器登录路径验证。

### Task 5: AI/OCR 正式配置与错题闭环

**Files:**
- Create: `backend/app/services/ai_runtime_config.py`, `backend/app/services/ocr_service.py`
- Modify: `backend/app/api/routes/model_test.py`, schemas and router
- Create: `backend/.env.example`
- Modify: `frontend/app/model-config/page.tsx`, `frontend/app/assistant/page.tsx`, `frontend/app/components/wrong_question_workspace.tsx`
- Test: new backend AI/OCR configuration tests and frontend wrong-question tests

- [ ] 写失败测试：未配置时给可操作提示；图片题必须确认文本后才能分析；已配置状态不回显密钥。
- [ ] 执行失败测试。
- [ ] 统一端口到 8000，添加教师专属配置状态、临时连通测试、视觉识题和错题分析降级。
- [ ] 执行相关测试与浏览器错题闭环验证。

### Task 6: 收尾、可访问性和全量验收

**Files:**
- Modify: 受前述任务影响的样式与用户文案
- Modify: `docs/互动课件重做_自检与验收清单_V1.0.md`
- Test: 全部前端、后端和浏览器路径

- [ ] 检查 keyboard、读屏、手机导航、减少动态效果、错误恢复。
- [ ] 执行全部前端测试、后端测试、类型检查和生产构建。
- [ ] 真实浏览器验证首次教师设置、创建学生、登录、学习、刷新恢复、错题、未配置 AI/OCR 提示。
- [ ] 更新验收说明并报告剩余仅依赖用户 API 配置的事项。
