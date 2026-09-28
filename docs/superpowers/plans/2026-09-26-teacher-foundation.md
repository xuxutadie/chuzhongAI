# 教师注册、认领与学情查看 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 教师自行注册，学生补齐学校班级，通过认领码建立可撤销的学情查看权限。

**Architecture:** 沿用现有会话与 SQLite，增加独立 teacher 角色和师生关联仓储；created_by 不承担认领职责。教师学情查询使用只读聚合，不调用会创建学习任务的学生页面服务。前端复用工作台外壳，但区分普通教师与管理员操作。

**Tech Stack:** FastAPI、Pydantic、SQLite、Next.js 15、React 19、TypeScript；本阶段无新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-26-teacher-registration-claims-design.md`；后续题库权限补充见同目录 `2026-09-26-teacher-question-bank-exams-design.md`。

## Global Constraints

- 中文界面和注释；不自动提交 Git、不修改 .env、不重置账号、不提交真实学生作答。
- 认领码 12 位、30 分钟、单次使用；新码替代旧码，只保存哈希。
- 教师每 10 分钟最多尝试 10 次认领；学生每小时最多生成 10 次码。
- 学校全称上限 100 字、班级上限 40 字；老师可自填多个任教班级，但不能冒充学校认证。
- 认领不改变 created_by、AI 模式、费用归属或原管理员密码管理范围。
- 任何教师数据读取均校验有效关联；无权限与不存在统一 404，未登录 401，角色不符 403。
- 数据库正式迁移前必须一致性备份及副本验证，不能在页面请求中迁移结构。
- 所有代码修改用 apply_patch；本目录不假定已是 Git 仓库，以测试与变更清单替代自动提交步骤。

## Review Focus

1. 旧客户端未传学校班级而保存档案时，不能擦除新字段（任务 3）。
2. 两个教师并发消费同一认领码，最多一人成功，另一人不获得学生信息（任务 4）。
3. 登录旧标签的 next 指向学生路由，教师不应跳转循环或加载学生数据（任务 2、5）。
4. 解除关联后，直接访问旧报告或错题图片地址也必须被拒绝（任务 6）。
5. 原管理员与自注册学生的旧会话、密钥模式在用户表迁移后保持一致（任务 1、8）。

## 文件边界与执行约定

新增 `backend/app/repositories/teacher_repository.py` 负责关系与只读连接；`teacher_schema.py` 只负责显式迁移；`teacher_accounts.py` 负责注册；`teacher_links.py` 负责码和授权；`teacher_insights.py` 负责查询。所有数据接口使用 `backend/app/schemas/teacher.py` 的明确响应模型，禁止输出仓储原始整行。

前端新增 `frontend/app/teacher/api.ts` 和局部组件；不把教师模块写进学生每日学习引擎。现有巨大服务只增加必要入口，保留原学生逻辑。

运行约定：后端测试 cwd 为 backend，命令 `C:/Users/6/AppData/Local/Programs/Python/Python314/python.exe -m unittest discover -s tests -p <文件名> -v`；前端测试 cwd 为 frontend，命令 `node --test tests/<文件名>`。每个任务均先记录新测试的失败，再实现，再确认通过。

### Task 1: 可回滚教师结构迁移

**Files:** 新建 `backend/app/repositories/teacher_schema.py`、`backend/app/repositories/teacher_repository.py`、`backend/scripts/migrate_teacher_workspace.py`、`backend/tests/test_teacher_migration.py`；修改 `backend/app/repositories/student_workspace_repository.py` 的新库 users 定义，不触碰既有账号内容。

**Interfaces:** `migrate_teacher_schema(db: sqlite3.Connection) -> None` 要求调用者已开始事务、已在事务外关闭外键执行；完成前执行外键检查。`TeacherRepository(path: Path).read()/transaction()` 复用短连接模式；`ready() -> bool` 仅检查版本。脚本 `--database PATH --backup PATH --check-only` 明确路径，无缺省正式写入路径；check-only不写结构。复用已有 `backup_database(source, target)`。

- [ ] 写 `test_migrate_preserves_ids_sessions_and_ai_mode`、`test_failure_rolls_back`、`test_repeat_keeps_revoked_links`，断言 `foreign_key_check == []`、原账号/会话/成绩行一致，重复迁移不恢复已解除的关联。
- [ ] 运行 `test_teacher_migration.py`，确认新增迁移尚不存在导致失败。
- [ ] 实现版本 1：teacher_profiles、teacher_student_links、student_claim_codes、teacher_action_events、teacher_schema_versions。师生组合唯一；码哈希唯一；审计不含明文码。
- [ ] 按 SQLite 建新 users 表、复制全部当前列、替换、还原索引和 sqlite_sequence 的方式扩充 CHECK；保留全部已存在外键。重建前断言支持的列集合，遇未知列停止而非丢列。关闭外键必须发生在 BEGIN 前；不可用 executescript 隐式提交。失败回滚后重新开启外键。
- [ ] 同一迁移中仅首次回填 created_by 指向 admin 的学生关系；其他角色不回填，不给管理员全局权限。
- [ ] 运行该测试文件和既有 `test_learning_route_migration.py`，全部通过后记录迁移验证结果。正式库暂不迁移。

### Task 2: 教师注册、身份和正确跳转

**Files:** 新建 `backend/app/services/teacher_accounts.py`、`backend/app/schemas/teacher.py`、`backend/app/api/routes/teacher.py`、`backend/tests/test_teacher_registration.py`；修改 `backend/app/api/router.py`、`backend/app/schemas/student_workspace.py`、`backend/app/core/security.py`、`frontend/app/student-api.ts`、`frontend/app/student-session-model.ts`、`frontend/app/student-registration-model.ts`；新建 `frontend/tests/teacher_registration.test.mjs`。

**Interfaces:** `TeacherAccounts(repository, workspace).register(username: str, password: str, display_name: str, school_name: str, teaching_classes: list[str]) -> dict` 返回现有 AuthResponse；`require_teacher(current_user) -> dict` 只接受真实会话角色 teacher/admin。公开 POST `/auth/register-teacher` 固定 teacher，响应 201；缺少已迁移结构返回清楚的 503，不能自动迁移。

- [ ] 写注册测试：`assert user['role'] == 'teacher'`；请求带 role/admin/created_by 返回 422；大小写重复账号 409；username/password 继续使用原长度与哈希规则；创建档案失败用户行也不保留。
- [ ] 写跳转测试：teacher 默认 `/teacher/students`；携带 `/dashboard` 或 `/subjects/math` 的 next 仍去教师首页；学生访问教师 next 被送回学生首页；合法同角色 next 保留。
- [ ] 执行新前后端测试确认失败。
- [ ] 实现注册用户和 teacher_profile 原子写入，复用密码/会话机制，不返回密钥字段。姓名 1–40 字、学校 1–100 字、任教班级 1–20 个且每项 1–40 字。注册复用已有来源限流，不信任伪造代理 IP 头。
- [ ] 加 teacher 到序列化与类型联合；新增教师授权依赖，不改旧 admin-only 管理接口权限。
- [ ] 重跑新测试及 `test_student_registration.py`、前端 `student_session_model.test.mjs` 和 `student-registration.test.mjs`，全部通过。

### Task 3: 学校班级资料与老用户补填

**Files:** 修改 `backend/app/schemas/transition_diagnosis.py`、`backend/app/services/transition_diagnosis.py`、`backend/app/api/routes/transition_diagnosis.py`、`shared/diagnosis-interview.json`、`frontend/app/diagnosis/model.ts`、`frontend/app/diagnosis/profile_editor.tsx`、`frontend/app/diagnosis/profile_card.tsx`、`frontend/app/profile/page.tsx`；新增 `backend/tests/test_student_school_profile.py`、`frontend/tests/school_profile.test.mjs`、`frontend/app/components/school_profile_notice.tsx`，在现有首页组件接入补填提示。

**Interfaces:** ProfileFields 新增 `school_name: str`、`class_name: str` 默认空；`DiagnosisService.update_school(user_id: int, revision: int, school_name: str, class_name: str) -> Profile` 只改两字段和 revision，保持 confirmed。新增 PATCH `/me/diagnosis/profile/school` 及同源代理白名单；原 PUT 保留缺省未传新字段。

- [ ] 写 `test_supplement_keeps_confirmed_attempt_and_route`，对所有测评与路线行做前后快照相等断言；`test_legacy_put_keeps_school` 验证老请求不擦除字段；过时 revision 409，学校 101 字和班级 41 字 422。
- [ ] 写前端问题排序和补填测试：新增问题逐问展示；旧 confirmed 档案只见补填提醒，不重新进入访谈；“暂未入学”“待分班”可显式选择。
- [ ] 执行新测试确认失败；实现合并时使用 Pydantic fields_set 区分缺省和用户显式清空，新学生首次确认校验必填，旧确认档案不强制回退。
- [ ] 保持历史报告 profile_json 原样；AI 上下文仍采用教学字段白名单，排除学校班级。
- [ ] 执行新测试与 `test_transition_diagnosis.py`、`diagnosis_api.test.mjs`，确认通过。

### Task 4: 原子认领、撤销、持久化限流

**Files:** 新建 `backend/app/services/teacher_links.py`、`backend/tests/test_teacher_links.py`；扩充任务 1 的仓储、任务 2 的模型/路由。

**Interfaces:** `TeacherLinks(repo, clock).issue_code(student_id: int) -> {code, expires_at}`；`claim(teacher_id: int, code: str, request_id: str) -> {link_id, student_id, linked_at}`；`list_for_student(student_id) -> list`；`revoke(actor_id, actor_role, link_id) -> None`；`require_link(db, teacher_id, student_id) -> row` 供其他服务同一读事务使用。

- [ ] 写测试：12 位安全随机码，TTL 恰为 1800 秒；重生成旧码失效；不同老师消费并发只有一条成功；同 request_id 重试得到同收据，不重复扣额度；相同编号不同码409。
- [ ] 写限流边界测试：第11次/10分钟认领429，第11次/小时生码429，时钟前进后恢复；失败消费的限流记录不会因事务异常回滚丢失。
- [ ] 写撤销测试：学生可撤销自己的关系、教师只能撤销自己的；码重放不能复活解除状态；同学生另发码可授权第二位教师；created_by 和 AI 模式始终不变。
- [ ] 执行测试确认失败；实现 secrets 安全随机、统一码规范化、SHA256 哈希，码响应 no-store，数据库事务 `BEGIN IMMEDIATE` 同时消费和建关联。使用成功后重试专用收据，不存码明文。
- [ ] 将发码、列表、认领、撤销端点接入教师路由；注册/认领之外所有访问走真实会话。失败码统一消息，不返回学生姓名。
- [ ] 重跑上述测试并检查数据库不存在原始码或个人 API 数据。

### Task 5: 注册与认领界面

**Files:** 新建 `frontend/app/api/auth/register-teacher/route.ts`、`frontend/app/api/teacher/workspace/[[...parts]]/route.ts`、`frontend/app/api/student/teacher-links/[[...parts]]/route.ts`、`frontend/app/teacher/api.ts`、`frontend/app/teacher/profile/page.tsx`、`frontend/app/components/teacher_claim_form.tsx`、`frontend/app/components/student_teacher_links.tsx`、`frontend/tests/teacher_workspace.test.mjs`；修改登录页及样式、`frontend/app/api/_backend.ts`、`student_nav.tsx`、`student_page_shell.tsx`、学生档案页。

**Interfaces:** 注册代理只接受固定的学生/教师后端路径常量，不允许客户端传后端 URL。`teacherGet<T>(path)`、`teacherPost<T>(path,payload)`、`teacherDelete(path)` 沿用 requestJson 的账号预期头和会话错误逻辑；代理路径/方法白名单与后端匹配。

- [ ] 测试登录三个固定入口、首次管理员入口条件、未选注册身份不提交、两次密码不同不可提交；教师不显示重置学生密码/服务器配置按钮。
- [ ] 测试发码说明、有效期、复制失败提示、生成后只内存持有、切号清空；认领提交防双击、保留请求编号供重试、成功后跳转已关联学生。
- [ ] 先跑失败测试，再实现界面。将旧 admin 添加学生/批量开通区域提取为管理员专用组件并保持功能，普通教师使用“认领第一位学生”空态；不新增无功能入口。
- [ ] 原生表单和按钮，明确键盘焦点、状态/错误文本；不使用单独颜色表示成功或失败。
- [ ] 执行 `node --test tests/teacher_workspace.test.mjs tests/teacher_registration.test.mjs` 与会话 race 系列测试；实际点击验证留到任务 8。

### Task 6: 学生详情只读聚合及文件授权

**Files:** 新建 `backend/app/services/teacher_insights.py`、`backend/tests/test_teacher_insights.py`；修改 teacher 仓储/模型/路由。

**Interfaces:** `TeacherInsights(repo).students(teacher_id, filters, offset, limit) -> {items,total}`；`overview(teacher_id,student_id) -> {profile,latest_assessment,today,last_activity}`；`history(teacher_id,student_id,kind,offset,limit) -> {items,total}`；`assessment(teacher_id,student_id,attempt_id)`；`wrong_question(teacher_id,student_id,question_id)`；`report_pdf(...) -> bytes`；`wrong_image(...) -> (bytes,media_type)`。

- [ ] 写每个接口的两教师/两学生矩阵，未关联/解除后/把他人记录ID放进已关联学生URL均404；缺会话401，student身份403；旧PDF/图片地址解除后也404。
- [ ] 写 `test_reads_have_no_learning_side_effects`，反复读取后每日路线、AI工作、测评和错题证据完全不变。进行中测评只返回状态，不能返回答案/参考解析。
- [ ] 执行失败测试；实现在同一读事务内确认关系后读取原表，避免 `DiagnosisService` 构造和学生 `ensure_*` 创建记录。无表/未完成返回“无记录”，数据库异常不能伪装成0分。
- [ ] 每页默认20条、最多100条；最近活动来自已有作答/学习时间，不用登录时间。按当前档案筛选；自述成绩独立标记。
- [ ] PDF复用 `render_report(result)`，输入严格限定当前学生已提交报告；图像只使用当前错题关联原图。原有服务对图形历史纠正的只读逻辑可复用，但不修改记录。
- [ ] 重跑测试，记录正确率分母、时间范围及空态样本。

### Task 7: 我的学生和学情详情

**Files:** 修改 `frontend/app/teacher/students/page.tsx`；新建 `frontend/app/teacher/students/[studentId]/page.tsx`、`frontend/app/teacher/components/student_insights.tsx`、`frontend/app/teacher/teacher.module.css`、`frontend/tests/teacher_insights_ui.test.mjs`；复用现有诊断报告纯展示部分，不携带学生 AI 解读触发器。

**Interfaces:** 页面消费任务6的公开 DTO；overview 首屏，其余分区按需分页获取，下载走授权BFF而不是公开教材路由。

- [ ] 写真实组件输出/状态测试：无学生认领引导、缺学校补填标签、无测评不出现0分；“学情概览/每日学习/测评/错题/报告”入口清楚；待批/未开始与完成区分。
- [ ] 测试账户切换取消旧请求、解除后清空已展示内容；网络错误提供重试，不保留其他学生上一屏图表。
- [ ] 执行失败测试，实施列表筛选和详情；各图表以真实数据驱动，不新造报告或增长值。
- [ ] 重跑测试、类型检查，检查管理员专属按钮仍只在admin显示。

### Task 8: 验收、备份和受控上线

**Files:** 更新 `docs/教师端基础阶段验收记录.md`（新建）及上述测试。迁移脚本沿用任务1，不新增隐藏启动脚本。

- [ ] 运行后端完整 unittest 与前端 `node --test tests/*.test.mjs`、`npm run type-check`；任何失败先定位，不能只报告新测试通过。
- [ ] 用 `NEXT_DIST_DIR=.next-teacher-qa` 隔离构建；PowerShell 用独立环境变量赋值后 `npm run build`，不覆盖运行中的开发输出。
- [ ] 在正式库一致性副本跑迁移，核对users、sessions、测评、错题、路线和加密配置行数与关键字段哈希；不输出个人内容和密钥。重复迁移、断言失败回滚、备份恢复验证均完成。
- [ ] 记录待上线旧进程的精确命令及路径，短暂停写；再做最终一致性备份，明确备份绝对路径，执行迁移、启动新后端，验证接口、旧登录及新角色。新库写入后不得盲目恢复旧备份覆盖新增数据。
- [ ] 采用测试账号完成教师注册→学生补填→发码→认领→看详情→解除的双身份浏览器验收，覆盖320/768/1440像素与键盘。测试账号需明确标识；未经用户授权不在正式库创建，优先独立验收数据库。
- [ ] 不绕过登录获取用户会话；真实浏览器需要登录时如实说明，不能用HTTP200或静态截图替代操作验收。
- [ ] 输出已完成项、未完成项、测试数量、备份位置和可直接使用的入口；只在全部本阶段要求完成后宣布基础阶段完成。

## 自查与执行交接

规格的注册、老档案、码、撤销、权限、详情、PDF、迁移分别落在任务2/3/4/6/8；后续发卷权限由第二计划覆盖。本计划没有安装依赖或修改正式数据。

推荐 Native：当前会话由主代理顺序实施，保留跨层上下文，末尾按执行技能做独立复核；另一种是逐任务交给子代理实施并复核，消耗更多上下文。本计划等待用户审阅并选择执行方式，不能将已批准的设计误称为代码已上线。
