# 教师知识库第一阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付教师私有的题库和教材管理，以及有来源、可审核的 AI 变式草稿和题组。

**Architecture:** 新建 `backend/app/teacher_knowledge/` 隔离资源、章节、题目版本、任务和生成逻辑；复用现有受限文档解析、教师会话及模型调用基础。新建教师专用前端页面和白名单代理，不改学生每日学习流程。教材提供经审核的范围，参考题提供范例，模型输出只进入待审核草稿。

**Tech Stack:** 当前项目 Next.js 15 / React 19 / TypeScript、FastAPI / Pydantic、SQLite；复用已声明 pypdf 6.12.2、python-docx 1.2.0、Pillow 12.1.0、pypdfium2 5.13.0。实施前核对锁文件实际版本与官方 API，不升级依赖。

**Spec:** `docs/superpowers/specs/2026-09-28-teacher-knowledge-library-design.md`；第二阶段参考 `docs/superpowers/specs/2026-09-26-teacher-question-bank-exams-design.md`，本计划不实施发卷、学生作答和成绩发布。

状态：用户已选择“按推荐执行”，主代理在当前会话实施。任务 1—8 核心代码和回归已完成；任务 9 页面、代理、类型与构建已完成，登录后的浏览器验收受环境限制未完成；任务 10 的副本演练、正式备份迁移与回归已完成。真实 AI/OCR 供应商烟测尚未执行。逐项证据和偏差以 `.superpowers/sdd/2026-09-28-teacher-knowledge-library/progress.md` 及 `docs/teacher-knowledge-acceptance.md` 为准，未逐一实际验证的原检查项不批量勾选。

## Global Constraints

- 只开放数学；不自动替换现有入学测评题库，不改变每日五步路线的完成判定。
- 文档单文件 20 MB、图片 5 MB、PDF 最多 50 页；单次最多 10 个文件、200 道候选题；单次生成最多 50 题；教师最多 2 个并行任务。
- DOCX 使用段落位置，不伪造页码；沿用解析器的解压、像素、耗时和输出限额。
- 草稿 → 待审核 → 已审核；修改形成新版本，审核不会自动沿用；归档可恢复，不删除被引用版本。
- 仅教师和管理员管理自己的资源；管理员不默认读取其他教师的库。学生不得访问题库原文件、答案或教师 API。
- 模型请求不携带学生身份、学校、认领码或其他教师内容；禁止借用学生 API 和普通教师隐式使用管理员额度。
- 不改 `.env`，不新增依赖，不自动提交 Git，不重置账号，不写真实学生学习进度。
- 显式版本化迁移，副本演练、备份和完整性验证之后才更新正式数据库；读取接口不建表。
- 本阶段只保存、审核和预览题组，不显示“已发给学生”，不声称已接入练习或错题收集。

## Review Focus

1. 文本／扫描混合教材，页次和配图不得错配；任务 2、4、8 使用混合样本核对来源。
2. 同一本教材上传多个章节文件，重复页号应有各自文件身份；任务 4 绑定 file_id 与 location。
3. 生成中归档／修订源题或章节、人工改稿，迟到结果不得覆盖；任务 7、8 验证版本检查。
4. 两个进程同时取任务、重启后租约过期，只允许有效持有者写回；任务 3 验证租约令牌。
5. 教师浏览器会话切换，旧请求和缓存不得显示上一账号资料；任务 9 的状态模型与双身份浏览器验收覆盖。

## 文件结构与共享约定

后端新增模块 `backend/app/teacher_knowledge/`：`__init__.py`、`schema.py`（迁移）、`repository.py`（事务和所属人查询）、`files.py`（私有文件）、`jobs.py`（持久队列）、`textbooks.py`（教材章节）、`questions.py`（题目审核）、`scope.py`（范围检索）、`teacher_ai.py`（教师配置）、`generation.py`（候选生成）、`question_sets.py`（版本化题组）、`worker.py`（工作生命周期）。

HTTP DTO 新建 `backend/app/schemas/teacher_knowledge.py`，路由新建 `backend/app/api/routes/teacher_knowledge.py`；注册于已有 `backend/app/api/router.py`。前端集中 `frontend/app/teacher/knowledge/`，新代理位于 `frontend/app/api/teacher/knowledge/[[...parts]]/route.ts`，导航仅修改已有 `frontend/app/components/student_nav.tsx`。

所有公开资源 ID 为服务端生成 UUID 字符串。`owner_id` 仅从会话进入服务方法。DTO 拒绝未知字段，错误不回显密钥和模型原始响应。列表返回 `{items,total,offset,limit}`，默认 limit=20、最大=100；revision 为从 1 开始整数，更新必须提交 expected_revision。错版本返回 409，越权对象返回 404，错误角色 403，未迁移 503，格式不合法 422。

共享 DTO（在任务 1 定义；后续不得各自另造同名结构）：

- `SourceRef(file_id: str, kind: Literal['page','paragraph'], index: int, region: list[float] | None)`，index 从 1 起，region 为 0—1 归一化矩形。
- `CourseScope(grade: str, edition: str, semester: str, chapter_version_ids: list[str], knowledge_point_ids: list[str], prerequisite_ids: list[str])`。
- `QuestionInput(prompt: str, response_type: Literal['single','multiple','boolean','short','worked'], options: list[dict], answer: dict, explanation: str, rubric: list[dict], asset_ids: list[str], needs_figure: bool, scope: CourseScope, difficulty: Literal['regular','advanced','challenge'], sources: list[SourceRef])`。
- `QuestionVersion(id: str, question_id: str, revision: int, content: QuestionInput, status: Literal['draft','pending_review','reviewed'], checks: list[dict])`。归档为题目实体属性，不擦除版本状态。
- `GenerationRequest(request_id: str, scope: CourseScope, difficulty: str, response_type: str, original_count: int, variant_count: int, reference_version_ids: list[str], allow_ai_fill: bool, purpose: Literal['test','practice'])`，合计 1—50；数量决定 original／variant／mixed，避免同时提交互相冲突的 mode。
- `PublicJob(id: str, state: str, completed_units: int, total_units: int, errors: list[dict], result_ids: list[str], revision: int)`；state 为 queued/running/needs_review/partial_failed/failed/completed/cancelled。
- `QuestionSet(id: str, revision: int, purpose: str, question_version_ids: list[str], scope: CourseScope, status: Literal['draft','reviewed'])`；本阶段没有 published 状态。

新测试使用 `unittest` 与现有 `backend/tests/teacher_test_support.py` 的临时数据库方式，禁止直接启动测试工作线程读取正式库。后端命令工作目录为 `backend`，前端命令工作目录为 `frontend`。当前已核实 `python` 与 `node` 可用。每任务执行红—绿测试循环，保留结果；按用户要求，不执行自动提交。

### Task 1：DTO、私有仓储与可重复迁移

**Files:** 新建模块 `__init__.py`、`schema.py`、`repository.py`、共享 DTO；新建 `backend/scripts/migrate_teacher_knowledge.py`、`backend/tests/test_teacher_knowledge_schema.py`。

**Interfaces:** `migrate_knowledge_schema(db: sqlite3.Connection) -> None`（调用方管理事务）；`KnowledgeRepository(path: Path).ready() -> bool`、`.read()`、`.transaction()` 返回关闭连接的上下文管理器；`owned(table: str, owner_id: int, object_id: str) -> dict` 的 table 只允许内部白名单。

- [ ] 写 `test_migration_idempotent_and_preserves_records`：迁移两次后版本号为 1，原 users 和学习记录行值完全不变；模拟失败后新增表和版本回滚；未迁移 ready=False。
- [ ] 写 `test_owned_queries_are_scoped`：教师 B 读取 A 对象抛出 404，管理员也不能绕过；`test_dto_rejects_owner_and_unknown_fields` 拒绝额外 owner_id、零页码和越界 region。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_schema.py -v`，确认新模块缺失导致失败。
- [ ] 建立带 `tk_` 前缀的 files、jobs、job_units、textbooks、chapter_versions、questions、question_versions、generation_sources、question_sets、review_events、schema_versions 表；外键、owner_id 联合约束、幂等索引和 revision 校验在仓储事务中落实。生成来源保留模型元信息，不保存密钥。
- [ ] 实现迁移脚本参数 `--database`、`--backup-dir`、`--dry-run`，SQLite backup API 生成带时间戳的新备份；dry-run 在临时副本迁移，失败不动原库。已有同名备份不可覆盖。
- [ ] 重跑本任务测试及既有教师迁移测试，全部通过；本任务不执行正式库迁移。

### Task 2：受限私有文件与解析结果

**Files:** 新建 `files.py`、`backend/tests/test_teacher_knowledge_files.py`；复用 `backend/app/teacher_assessment/extractors.py`，仅在安全修复确有必要时改其实现并回归既有解析测试。

**Interfaces:** `KnowledgeFiles(repository, storage_root: Path).store(owner_id: int, filename: str, content: bytes) -> dict`、`.read(owner_id: int, file_id: str) -> tuple[bytes,str]`、`.extract(owner_id: int, file_id: str) -> ExtractedDocument`、`.set_archived(owner_id, file_id, archived, expected_revision) -> dict`。

- [ ] 写 `test_limits_and_private_reads`：20 MB 文档／5 MB 图片边界、51 页拒绝、旧 DOC／伪类型／损坏／加密 PDF／超像素／压缩炸弹拒绝；B 无法读取 A 原件与图片。
- [ ] 写 `test_source_positions_and_mixed_scan`：PDF 来源页序保留，DOCX 返回 paragraph，扫描页有待识别提示，图片清除元信息；文件名包含路径片段不能逸出 storage_root。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_files.py -v` 确认失败。
- [ ] 实现摘要去重仅限同一 owner，使用随机存储标识和原子写入；异常清理未登记临时文件，不删除已引用原件。原件只提供安全下载；预览使用清洗后图片或提取内容，不内嵌可执行上传内容。
- [ ] 重跑本任务及 `test_teacher_document_support.py`，确认限制、去重、归档恢复与来源正确。

### Task 3：可恢复处理队列和生命周期

**Files:** 新建 `jobs.py`、`worker.py`、`backend/tests/test_teacher_knowledge_jobs.py`；在 `backend/app/main.py` 组合现有 `learning_lifespan` 与新 worker，不修改错题任务业务。

**Interfaces:** `KnowledgeJobs(repo).enqueue(owner_id: int, kind: str, payload: dict, request_id: str) -> PublicJob`、`.claim(worker_id: str, now: datetime) -> dict | None`、`.complete_unit(job_id: str, lease_token: str, result: dict) -> None`、`.status(owner_id, job_id) -> PublicJob`、`.cancel(owner_id, job_id, expected_revision) -> PublicJob`、`.retry_failed(owner_id, job_id, expected_revision) -> PublicJob`；`run_one(worker_id: str) -> bool`。

- [ ] 写 `test_two_workers_cannot_commit_same_unit` 与 `test_expired_lease_rejects_late_result`；写 `test_limits_idempotency_cancel_retry`：同教师最多 2 个 running、重复 request_id 返回原任务、cancel 后不得写结果、只重试失败单元。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_jobs.py -v` 确认失败。
- [ ] 用事务领取、随机租约令牌、超时续租和 fencing 检查防止重复写回；外部处理在事务外；单文件和分页单元独立记录。恢复重试保留人工草稿 revision。
- [ ] worker 仅在显式迁移完成后工作；测试可注入处理器和时钟，不调用真实模型。优雅停机不把中断伪记完成；启动不迁移数据库。
- [ ] 重跑任务测试并确认既有错题 worker 的启动和关闭行为未回归。

### Task 4：教材、章节核对与范围快照

**Files:** 新建 `textbooks.py`、`scope.py`、`backend/tests/test_teacher_knowledge_textbooks.py`；读取 `shared/curriculum/` 已有数学目录，不重写其内容。

**Interfaces:** `TextbookService(repo).create(owner_id: int, metadata: dict) -> dict`、`.attach_file(owner_id, textbook_id, file_id, expected_revision) -> dict`、`.save_chapter(owner_id, textbook_id, payload: dict, expected_revision: int | None) -> dict`、`.review_chapter(owner_id, chapter_version_id, expected_revision) -> dict`；`ScopeService(repo).resolve(owner_id: int, scope: CourseScope) -> dict` 返回已审核范围、有限引用片段及版本。

- [ ] 写 `test_multiple_files_keep_source_identity`：两个文件均为第 1 页，不互相覆盖；`test_unreviewed_and_foreign_chapters_block_generation`；`test_missing_prerequisite_and_mixed_edition_rejected`；系统教材只读、语英不出现在可用目录。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_textbooks.py -v` 确认失败。
- [ ] 创建／修订／归档／恢复教材与章节；目录候选保留页码或段落范围，教师核对后固定版本，审核要求范围指向实际文件内容。超 50 页提示章节拆分，不修改解析上限。
- [ ] 系统目录仅映射已审核章节知识点，缺少映射的教材可预览不可自动出题；resolve 拒绝未知、归档、未审核、跨版本范围。返回引用片段与资源标识，不返回整库。
- [ ] 重跑测试，通过后记录当前真正支持的年级、版本与章节，不宣传任意教材均可生成。

### Task 5：题目核对、不可变版本和审核

**Files:** 新建 `questions.py`、`backend/tests/test_teacher_knowledge_questions.py`。

**Interfaces:** `QuestionService(repo).save(owner_id: int, content: QuestionInput, question_id: str | None, expected_revision: int | None) -> QuestionVersion`、`.review(owner_id, version_id, expected_revision, confirmed_checks: list[str]) -> QuestionVersion`、`.split(owner_id, version_id, children: list[QuestionInput], expected_revision) -> list[QuestionVersion]`、`.merge(owner_id, version_ids: list[str], content: QuestionInput, expected_revisions: list[int]) -> QuestionVersion`、`.set_archived(owner_id, question_id, archived, expected_revision) -> dict`。

- [ ] 写 `test_edits_create_unreviewed_revision`、`test_missing_answer_figure_scope_blocks_review`、`test_foreign_assets_rejected`、`test_split_merge_retains_sources`、`test_revision_conflict_preserves_author_edit`；答案对象按题型验证，单选答案必须落在选项中。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_questions.py -v` 确认失败。
- [ ] 实现手工录题与待核对编辑，草稿允许不完整，但 review 必须完整；先执行结构、来源、范围检查，再记录教师图文和解法确认。可确定性计算以受限规则校验，禁止 eval；不能验证的标记人工核对。
- [ ] 拆合题不删除旧版本；配图必须由本人可用资源或受限渲染描述产生；AI 补答案单独标识。相似题只显示提醒，不自动合并。
- [ ] 重跑测试，审核／归档审计可读且不记录密钥和学生资料。

### Task 6：教师 AI 配置隔离

**Files:** 新建 `teacher_ai.py`、`backend/tests/test_teacher_knowledge_ai.py`；复用 `personal_api_vault.py`、`ProviderRuntimeConfig` 和官方供应商允许列表，不放宽 `PersonalAIConfigService` 的学生权限。

**Interfaces:** `TeacherKnowledgeAI(workspace_repository, settings).status(owner_id: int) -> dict`、`.save_config(owner_id: int, capability: str, payload: dict) -> dict`、`.clear_config(owner_id, capability) -> None`、`.resolve(owner_id, capability) -> ProviderRuntimeConfig`、`.generate(owner_id, context: dict) -> dict`、`.recognize(owner_id, image: bytes, media_type: str) -> dict`。

- [ ] 写 `test_teacher_uses_only_own_encrypted_config`、`test_student_key_and_admin_fallback_denied`、`test_admin_uses_existing_server_config`、`test_status_errors_and_logs_never_include_key`、`test_unconfigured_preserves_manual_workflow`。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_ai.py -v` 确认失败。
- [ ] 实现独立教师身份判断和 vault 存取；无教师配置返回可行动错误，不静默回退；管理员沿用已有服务器配置。明文密钥只在受控服务端调用期间使用。
- [ ] 只接受现有允许的官方 HTTPS 服务地址、能力 llm/ocr；提交前显示将使用教师服务，禁止任意 URL 与文档指令触发工具调用。
- [ ] 重跑测试；真实付费模型烟测不默认发送真实学生或教师私有文件，用明确测试资料且不修改用户配置。

### Task 7：资源检索、OCR 整理与变式任务

**Files:** 新建 `generation.py`、`backend/tests/test_teacher_knowledge_generation.py`，连接任务 3 的 import/generate 处理器。

**Interfaces:** `GenerationService(repo, ai).enqueue(owner_id: int, request: GenerationRequest) -> PublicJob`、`.process_import(job: dict) -> dict`、`.process_generation(job: dict) -> dict`；`ScopeService.select_references(owner_id: int, scope: CourseScope, version_ids: list[str]) -> list[QuestionVersion]`。

- [ ] 写 `test_variants_record_real_references_and_changed_solution`、`test_empty_bank_requires_explicit_fill_and_reviewed_scope`、`test_partial_bank_never_silently_fills`、`test_unknown_citation_and_out_of_scope_rejected`、`test_archive_during_generation_returns_reviewable_conflict`。
- [ ] 写 `test_import_limit_and_human_edit_protection`：最多 200 候选题，模型迟到不覆盖人工 revision；混合扫描页保留文件／页定位；`test_prompt_has_no_student_identity_or_other_owner_data`。
- [ ] 运行 `python -m unittest discover -s tests -p test_teacher_knowledge_generation.py -v` 确认失败。
- [ ] 原题只用审核版本，variant 要有合法参考题，allow_ai_fill 显式开启才允许教材补题；grade、edition、semester 与知识点检索不得扩展。缺额结构化返回给 UI。单次有限上下文预算超限返回分批处理，不静默切掉必要题图。
- [ ] 本地提取后按需 OCR、拆题和目录建议进入候选状态；无配置仍可查看原文并手工整理。模型生成答案、解析和必要图形数据，验证失败不转为已审核。
- [ ] 处理图形尺寸同步、畸形 JSON、无内容、超时、取消及源版本变化；所有引用由服务端从实际输入集合映射，生成结果仅保存新草稿。
- [ ] 重跑测试，确认预先取消任务不调用模型，已发出调用的结果不可在取消后入库。

### Task 8：原题／变式／混合题组与教师 API

**Files:** 新建 `question_sets.py`、HTTP 路由、`backend/tests/test_teacher_knowledge_api.py`、`backend/tests/test_teacher_knowledge_sets.py`；修改 `backend/app/api/router.py`。

**Interfaces:** `QuestionSetService(repo).save(owner_id, purpose, question_version_ids, scope, set_id=None, expected_revision=None) -> QuestionSet`、`.review(owner_id, set_id, expected_revision) -> QuestionSet`、`.preview(owner_id, set_id) -> dict`。API 基路径 `/teacher/knowledge`；资源 GET/POST/PATCH 与 review/archive/restore/cancel/retry 显式 POST；没有 publish 接口。

- [ ] 写 `test_mixed_counts_exact_and_versions_frozen`、`test_sets_require_each_question_review`、`test_source_revision_replacement_requires_reapproval`；原版本引用不被编辑悄悄替换，显式换题使题组退回草稿。
- [ ] 写 `test_student_and_cross_teacher_access_denied` 覆盖每个资源、任务、文件及图片；`test_unmigrated_read_returns_503_without_writes`；`test_response_cache_headers_and_field_whitelist`。
- [ ] 运行 `python -m unittest discover -s tests -p 'test_teacher_knowledge_*s.py' -v` 确认新增测试失败。
- [ ] 挂载教师会话依赖；分页筛选使用参数化 SQL、受限排序；草稿预览明确仅供教师，不与学生端答案释放接口共用。
- [ ] 上传采用分批单文件二进制请求、服务端流式计数与批次限额，不为 multipart 擅自新增依赖；文件校验沿用任务 2。下载与原文预览均二次鉴权。
- [ ] 重跑新增题组／接口测试及现有教师学情、注册和认领测试，确认 HTTP 状态、缓存与无副作用读取符合约定。

### Task 9：教师知识库界面与白名单代理

**Files:** 新建 `frontend/app/teacher/knowledge/page.tsx`、`api.ts`、`types.ts`、`knowledge.module.css`、`state_model.js`、`state_model.d.ts`；components 下新建 `question_library.tsx`、`textbook_library.tsx`、`import_review.tsx`、`generation_form.tsx`、`question_set_preview.tsx`、`teacher_ai_settings.tsx`。新增专用 catch-all API 代理及 `frontend/tests/teacher_knowledge_model.test.mjs`、`teacher_knowledge_proxy.test.mjs`；修改 `student_nav.tsx` 添加知识库入口和外观键。

**Interfaces:** 浏览器 `knowledgeRequest<T>(path: string, options?: RequestInit) -> Promise<T>` 仅访问同源新代理；DTO 与后端命名逐字段一致。`state_model.js` 输出 `canReviewQuestion(question) -> boolean`、`validateGeneration(form) -> {errors: string[]}`、`isCurrentResponse(requestOwner, activeOwner, requestVersion, activeVersion) -> boolean`。

- [ ] 写 Node 测试：缺答案／缺图／未知范围禁止审核、0/51 题拒绝、混合数量一致、未允许补题缺额提示、不同 owner 或过时请求结果不能进入 UI；代理拒绝非法路径／方法和 query 注入。
- [ ] 运行 `node --test tests/teacher_knowledge_model.test.mjs tests/teacher_knowledge_proxy.test.mjs` 确认失败。
- [ ] 实现两标签与分页筛选，保持教师导航和现有蓝图风格；空库、搜索空结果、服务错误区分。按钮应真实执行保存和审核，不填演示统计或模拟成功。
- [ ] 实现上传批次、进度、失败重试、原文对照、手动拆合题／补图；教材允许附加章节文件。切换账号或卸载时取消旧请求并清空私有数据。
- [ ] 实现原题／变式／混合模式、三档难度、题量与用途、资源缺额提示、补题确认和来源显示；首屏展示教师 AI 未配置提示和设置入口。题组仅显示“保存／审核／预览”，不显示发卷按钮。
- [ ] 专用代理限制资源 UUID、方法与查询字段，复用 `_backend.ts` 鉴权转发；如需二进制流式扩展只增加受限 helper，不改变既有代理行为。输入数值非法时阻止提交，不把中文提示写入 number value。
- [ ] Node 测试、`npm run type-check` 通过；桌面／手机／键盘真实浏览器完成一次教材和题目管理流程，再切换身份检查缓存隔离。

### Task 10：副本端到端演练、迁移和交付

**Files:** 新建 `backend/scripts/verify_teacher_knowledge.py`、`backend/tests/test_teacher_knowledge_workflow.py`、`docs/teacher-knowledge-acceptance.md`；更新 README 的教师知识库使用说明。

**Interfaces:** 验证脚本参数 `--database`、`--output-dir`，默认拒绝把测试数据写进输入库；使用 SQLite backup 到临时目录后运行，输出脱敏检查结论与统计，不导出用户密钥。

- [ ] 写并先运行 `test_upload_review_generate_save_workflow`：两个临时教师和学生，章节上传→核对→参考题录入审核→模拟模型生成→变式审核→题组预览，确认学生仍无权限且学习进度不变。
- [ ] 实现副本演练，比较迁移前后原有账号和学习数据的计数与规范化摘要，`PRAGMA integrity_check` 为 ok、`foreign_key_check` 无结果，重复迁移安全。
- [ ] 执行 `python -m unittest discover -s tests -p 'test_teacher_knowledge_*.py' -v` 和项目现有后端全量测试；前端 `node --test tests/*.test.mjs`、`npm run type-check`、隔离构建通过。运行前检查端口和输出目录，禁止停止未知进程或删除共用构建目录。
- [ ] 用已有浏览器工具依技能进行桌面与手机验收：两个教师、一个学生，文件权限、无 AI、本地手工流程、模型错误和恢复。没有真实模型可用时明确记录仅模拟服务通过，不宣称线上生成已验证。
- [ ] 正式迁移前解析并记录准确数据库路径，确认副本通过和备份可读；仅停止本项目需要停止的服务，再执行版本化迁移，启动后验证知识库与原学习页面。失败时停止进一步写入，保留新旧库和日志，不盲目覆盖用户数据。
- [ ] 完成验收文档，列出真实测试结果、可使用入口、支持格式与限额、教师审核规则、第二阶段尚未接入项。只交付已验证功能，不提交 Git、不编造演示学生记录。

## 自检与执行交接

- 规格第 3 节由任务 9 覆盖，第 4 节由任务 2/3/7 覆盖，第 5/6 节由任务 4—8 覆盖，第 7/8 节由任务 1/3/8/10 覆盖。
- 五项额外风险分别纳入混合扫描、多文件来源、迟到修订、租约 fencing 和前端身份响应检查测试。
- 本计划新增任务均为拟实施内容；实际可用基础只有现有教师身份、解析器、学生教材和模型服务组件。
- 推荐当前会话由主代理按顺序实施，因为迁移、资源版本、生成引用与界面契约相互依赖。可选逐任务子代理加独立审查，但需要用户选择该执行方式。
- 用户审阅计划并选择方式后，读取对应执行技能再实现；本轮不以“开始吧”替代尚未存在的计划审阅。
