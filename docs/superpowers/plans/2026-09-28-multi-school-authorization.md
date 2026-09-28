# 多学校隔离与学生授权 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立学校／机构空间及逐教师授权，在不破坏个人学习历史的前提下接管教师数据访问。

**Architecture:** 空间成员关系和学生学情授权分别管理，均基于服务端真实会话。先交付未挂载的权限基础模块并在临时数据库验证，再完成全部旧入口、资源、任务和前端接入；切换前不能将局部实现称为多校隔离已完成。

**Tech Stack:** 现有 Python/FastAPI、SQLite、Next.js、unittest；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-28-multi-school-authorization-design.md`

## Global Constraints

- 教师只能查看已授权学生的记录；同校、同班、创建账号或担任学校管理员，本身均不构成学情查看授权。
- 授权范围固定 `all_learning_history_read`，涵盖全部已形成历史及有效期间新增记录，只读。
- 不安装新依赖、不修改 `.env`、不自动提交 Git、不清空旧数据。
- 平台管理员保留经审计的全站管理能力；指定管理员账号、原密码和历史数据保留。
- 本阶段沿用现有数据库引擎；原账号、答卷、错题及报告不迁移到新用户。
- 未完成全部入口接管、映射及迁移演练前，不在正在使用的数据库启用新边界。

## Review Focus

1. 同名学校／自行填写学校不能取得身份：任务 1、2 验证不同 ID 且无自动成员。
2. 旧会话排队后被撤销仍尝试写入：任务 2 在写锁内重验 token 与 auth_version。
3. 重复确认或重放旧邀请复活已撤销授权：任务 3 验证消费状态及授权修订。
4. 停用再恢复学校、成员、账号导致旧授权复活：任务 3、4 验证持久撤销及版本失效。
5. 多标签切换和长任务晚到数据串校：任务 5、6 验证上下文版本与输出前复核。

## 文件职责与分阶段交付

`backend/app/education/` 新建 `schema.py`（显式事务迁移）、`policy.py`（统一权限）、`service.py`（空间与成员）、`grants.py`（邀请与学生授权）、`errors.py`（安全错误）、`models.py`（严格输入）。不拆分现有业务目录。

首个可验证交付为任务 1–3：未挂载的后端权限基础，不改变现行网站权限。后续任务 4–8 完成后一次切换；这不是允许旧权限与新权限混用的过渡接口。

### Task 1: 数据结构与只读权限策略（首批已实现并验证）

**Files:** Create `backend/app/education/{__init__,schema,errors,policy}.py`; Test `backend/tests/test_education_policy.py`, `backend/tests/education_test_support.py`。

**Interfaces:** `migrate_education_schema(db) -> None` 必须在显式事务中；`education_schema_ready(db) -> bool`。`SessionIdentity(user_id:int, token_hash:str)`；`SpaceContext(space_id:str, membership_id:str, space_revision:int, membership_revision:int)`；`require_session(db, identity) -> sqlite3.Row`；`require_context(db, identity, context, roles:tuple[str,...]) -> sqlite3.Row`；`require_history(db, identity, context, student_id:int, expected_revision:int|None=None) -> sqlite3.Row`。

- [ ] 写失败测试：缺迁移 503；伪造 token 401；其他用户成员 ID 404；空间修订过期 409；学校管理员无授权 404；持有效授权的教师可读且必须在对应空间。
- [ ] 在 backend 运行 `python -X utf8 -m unittest discover -s tests -p 'test_education_policy.py' -v`，应先失败，确认缺少模块／功能。
- [ ] 显式新增空间、成员、成员邀请、学生授权邀请、学生授权和审计表；外键、状态及范围 CHECK、成员唯一键。不从旧链接生成授权，不修改 users。
- [ ] 实现统一鉴权，账号有效、真实会话未过期、角色与成员身份匹配；不信任仅 user_id 的调用。
- [ ] 重跑同命令，应全部通过，验证事务回滚和重复迁移不改变旧表。

### Task 2: 学校开通、成员邀请与停用（首批已实现并验证）

**Files:** Create `backend/app/education/{service,models}.py`; Test `backend/tests/test_education_spaces.py`。

**Interfaces:** `EducationSpaces(repo, identity)`；`create_space(payload:dict)->dict`；`list_spaces()->list[dict]`；`invite_member(context, payload:dict)->dict`；`accept_member(payload:dict)->dict`；`set_space_state(space_id,payload:dict)->dict`；`set_member_state(context,membership_id,payload:dict)->dict`。入口都在事务内部调用任务 1 的校验。

- [ ] 写失败测试：平台管理员才能开通；邀请仅绑定目标账号、角色与空间；外校管理员不能变更；不能邀请全站 admin 角色；过期／已用码拒绝；审计失败整笔回滚；排队后退出登录的写入 401。
- [ ] 运行 `python -X utf8 -m unittest discover -s tests -p 'test_education_spaces.py' -v`，观察失败。
- [ ] 实现严格输入、摘要存储的一次性邀请、无敏感字段的返回结构。邀请 24 小时有效；邀请接受不能恢复已停用的成员；平台管理员指定的首位校管理员也需要接受邀请。
- [ ] 停用递增修订并持久撤销关联授权／未消费授权邀请，恢复不回填旧授权。审计只保存动作、目标和状态，禁止邀请码／密钥。
- [ ] 同命令通过；旧公开注册不自动生成成员，现阶段服务未挂载。

### Task 3: 学生明确同意与撤销（首批已实现并验证）

**Files:** Create `backend/app/education/grants.py`; Modify `backend/app/admin_workspace/accounts.py`; Test `backend/tests/test_education_grants.py`。

**Interfaces:** `StudentGrants(repo, identity)`；`invite(context,payload:dict)->dict`；`preview(token:str)->dict`；`confirm(payload:dict)->dict`；`list_mine()->list[dict]`；`revoke(grant_id:str,payload:dict)->dict`；`revoke_account_grants(db,user_id:int)->None`。

- [ ] 写失败测试：只有绑定学生可预览和确认；确认值必须为 true 且不能由教师代办；两个学校各自授权；撤销一个不影响另一个；旧请求／旧码不复活；教师退出学校后拒绝；账号停用再恢复仍撤销。
- [ ] 运行 `python -X utf8 -m unittest discover -s tests -p 'test_education_grants.py' -v`，观察失败。
- [ ] 实现固定只读范围、24 小时一次性目标绑定邀请、请求编号及修订冲突；不将邀请码写入审计。返回说明明确全部历史和有效期新增记录。
- [ ] 管理员停用、删除、移除教学身份时，在原有账号变更事务内撤销授权；未迁移库不触发新表访问。
- [ ] 同命令通过，重复确认只允许返回仍有效且修订相同的原结果；提交新请求不得复用已消费邀请。

### Task 4: 学情接口与旧入口完整接管

**Files:** Modify `backend/app/api/routes/teacher.py`, `backend/app/services/{teacher_links,teacher_insights}.py`; Create `backend/app/api/routes/education.py`; Modify `backend/app/api/router.py`; Test `backend/tests/test_education_api.py`。

**Interfaces:** 请求提供 `X-Education-Space-Id`、`X-Education-Membership-Id` 及两个修订头；服务端构建任务 1 上下文。TeacherInsights 使用明确 scope 和 require_history；平台管理员专用视图保持原独立鉴权。

- [ ] 红灯测试覆盖列表／统计／详情／PDF／图片替换 ID、同校未授权、未交卷、教师原资源链接、缺迁移和已撤销会话。
- [ ] 将学生列表 SQL 改为按当前成员有效授权筛选；历史可跨记录学校但不能读取原始私有题库；附件渲染后以新连接复查授权。
- [ ] 废止旧认领码直接认领路径，统一新邀请确认，不保留备用绕过入口。只在完整切换中挂载。
- [ ] `python -X utf8 -m unittest discover -s tests -p 'test_education_api.py' -v` 通过。

### Task 5: 知识库、文件、AI 与后台任务空间归属

**Files:** Modify `backend/app/teacher_knowledge/{schema,repository,files,jobs,worker,textbooks,questions,question_sets,generation,teacher_ai}.py`, `backend/app/api/routes/teacher_knowledge.py`; Test `backend/tests/test_education_knowledge.py`。

**Interfaces:** KnowledgeRepository 带必需的 identity/context；后台任务捕获同一上下文的修订，不能伪造普通 HTTP 会话。原 owner_id 同时保留；管理员全局只读查询显式使用专用权限路径。

- [ ] 红灯测试覆盖同教师不同空间、同校不同教师、父子资源替换、文件摘要去重、request_id 去重、归档恢复和后台撤权。
- [ ] 所有 tk 表及 jobs 增加 space_id，唯一键增加空间；逐项审查原始 SQL，不能只改通用 owned()。私有凭证空间＋教师定位，统一额度需显式空间分配。
- [ ] 后台领取／调用前／写回／输出校验成员版本；撤销后不落库结果。无空间旧资源隔离；公开课程可继续共享。
- [ ] `python -X utf8 -m unittest discover -s tests -p 'test_education_knowledge.py' -v` 通过。

### Task 6: 管理台、教师切换及学生授权页面

**Files:** Create `frontend/app/education/{api,context_model}.ts`, `frontend/app/api/education/[[...parts]]/route.ts`, `frontend/app/admin/spaces/page.tsx`, `frontend/app/teacher/spaces/page.tsx`, `frontend/app/authorizations/page.tsx`; Modify `frontend/app/components/{student_nav,student_page_shell,student_teacher_links}.tsx`, `frontend/app/teacher/knowledge/api.ts`（执行时核实实际 API 封装文件）。Test `frontend/tests/education_context.test.mjs`。

- [ ] 红灯测试：账号切换、空间切换、旧请求晚到均不显示旧数据；附件上下文不缺失；同意未勾选不能发送。
- [ ] 接入严格代理白名单及同源检查；显示“学校管理”和“学生授权”不同概念；复用现有蓝图风格。
- [ ] 教师无成员时仅资料／邀请；学校管理员仅成员名册；学生可预览范围、确认和单独撤销，原独立学习不受影响。
- [ ] 运行前端全量测试、类型检查；桌面及移动端真实流程另行记录，不以静态代码检查代替。

### Task 7: 明确映射、迁移演练与一次切换

**Files:** Create `backend/scripts/migrate_education_spaces.py`, `backend/scripts/verify_education_spaces.py`; Test `backend/tests/test_education_migration.py`；记录 `docs/multi-school-acceptance.md`。

- [ ] 红灯测试：损坏映射拒绝；重复迁移无损；迁移失败回滚；旧账号哈希与业务指纹不变；未映射资料隔离且未自动授权。
- [ ] 工具默认只读盘点／副本演练，备份数据库、私有附件与加密配置；运行中服务不得与文件复制产生不一致快照。
- [ ] 生成显式映射，待平台管理员确认后才运行正式迁移；这项确认仅针对真实数据归属，不是重新确认功能设计。
- [ ] 完整版本部署后停旧任务、短事务迁移、校验、撤销旧上下文、统一启用；不执行自动恢复覆盖。

### Task 8: 回归、安全复核与交付

- [ ] 后端全量 `python -X utf8 -m unittest discover -s tests -v`。
- [ ] 前端全量 `node --experimental-strip-types --test tests/*.test.mjs`、`pnpm exec tsc --noEmit`、隔离构建目录正式构建。
- [ ] 新审查者审查所有权限入口及上述五项 Review Focus；重要问题先复现红灯再修复。
- [ ] 写明已完成、未启用、未验证及上线阻塞项；保留日志。不得把依赖告警、真实 AI/OCR 和容量验收声明为已完成。

## 自查与执行裁定

- 用户已经确认设计并明确要求直接修改；不再重复请求功能设计或执行方式确认，按本会话顺序实施。
- 工作区无 Git 元数据，不能依赖 worktree／commit 脚本；使用本地进度记录，不自动初始化 Git。
- 任务 1–3 不挂载新路由，不修改真实库；完成后仍不可宣称全站隔离生效。
- 任务 4–7 共用 SessionIdentity/SpaceContext 契约；独立学生个人访问不消费空间上下文。
- 如工作跨轮次，记录准确完成范围，下一轮从未完成项续接。
