# 教师题库与测试发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 贯通文件导入、教师审核、三档难度组卷、授权发卷、学生作答、批阅及错题收集。

**Architecture:** 依赖教师基础阶段提供真实teacher身份、有效师生关系和撤销检查。将题库资源、题目版本、试卷发布快照和学生作答分开持久化；模型只能生成候选内容，发布和成绩确认是显式操作。现有每日路线保持不变，复用作答证据和错题学习入口。

**Tech Stack:** FastAPI、SQLite、Next.js、React、现有模型请求与密钥保护模块；文档解析/页面渲染依赖必须经任务1审批。

**Spec:** `docs/superpowers/specs/2026-09-26-teacher-question-bank-exams-design.md`；依赖 `docs/superpowers/plans/2026-09-26-teacher-foundation.md`。

## Global Constraints

- 数学优先，语文英语隐藏；只开放已审核课程范围，不能标注“任意年级都支持”。
- PDF/DOCX 20 MB、图片5 MB；PDF最多50页；单次最多10个文件、200道候选题；单次组卷最多50题；教师最多2个并发处理工作。
- DOCX没有稳定页数时不伪造页码；使用段落序号，另限制20000段及100 MB总解压大小；最多2000 ZIP条目，防止解压异常。
- 三模式共用同一范围白名单；草稿生成→教师审核→发布；不能不经审核自动发卷。
- 新发布快照不可变；修改题库不改变学生试卷。服务器保存私有答案，学生答题响应不含答案或原文档。
- 模型用量归发起教师；不得借用学生密钥。公开注册不意味着免费使用管理员服务器模型。
- 未作答/未参加/主观题待批阅不视为确认错题；只在结果正式发布后收集已确认错答。
- 新题库和测试不得变更已有今日路线、成长值、学生答案和历史诊断分数。
- 不自动提交Git、不改.env、不安装未经批准依赖；先备份再正式迁移；所有验证用测试身份/数据库。

## Review Focus

1. 扫描页与可选中文本混合，图形标注不能被漏掉或重复成两题（任务3）。
2. 生成期间教师已编辑草稿，迟到模型结果不能覆盖人工内容（任务5）。
3. 老师正在预览时有人解除关联，发布事务必须再次拒绝该目标（任务6）。
4. 学生离线、多标签重复交卷、截止瞬间保存，只接受明确版本的服务端答案（任务7）。
5. 评分订正后原题仍有其他错答证据，不得删除整条错题或伪标掌握（任务8）。

## 文件与接口约定

后端新增 `app/teacher_assessment/`：schema.py、repository.py、assets.py、extractors.py、bank.py、curriculum.py、jobs.py、teacher_ai.py、generation.py、exams.py、submissions.py、grading.py；每个文件只承担命名职责。HTTP入口拆成 `app/api/routes/teacher_assessment.py` 与 `student_teacher_tests.py`，共享Pydantic DTO在 `app/schemas/teacher_assessment.py`。

前端集中 `app/teacher/question-bank/`、`app/teacher/exams/`、`app/teacher-tests/`；共享答题控件保留安全图形展示，不修改每日路线组件业务。新增代理独立白名单，不给通用任意路径转发能力。

任务间的 `QuestionDraft` 固定字段：id、revision、prompt、response_type、options、answer、explanation、rubric、asset_ids、course_version、knowledge_point_ids、prerequisite_ids、difficulty、source_ref、review_status。审核仅对指定revision有效。

`ExamBlueprint` 固定字段：student_ids、course_version、knowledge_point_ids、mode（regular/advanced/challenge）、sections（type/count/points）、suggested_minutes、deadline、allow_variants、allow_ai_fill。服务端计算总题量/分值，不信任客户端合计。

测试命令：backend目录运行 Python314 `-m unittest discover -s tests -p <文件名> -v`；frontend目录 `node --test tests/<文件名>`。每任务新测试必须先失败后通过。

### Task 1: 确认解析依赖与限定适配器

**Files:** 新建 `docs/教师题库文件解析依赖说明.md`、`backend/tests/test_teacher_document_support.py`；获批准后才改 `backend/requirements.txt`。

**Interfaces:** 下游依赖 `extract_document(data: bytes, media_type: str, limits: DocumentLimits) -> ExtractedDocument`，其结构包含 sources[{index,text,formulas,asset_refs,warnings}]；PDF页使用从1开始页码，DOCX用段落索引。

- [ ] 在文档记录本机检测到 pypdf 6.12.2、python-docx 1.2.0、Pillow 12.1.0，但项目requirements未声明这些包；存在于本机不等于生产部署依赖已获批准。
- [ ] 验证已有包读取样本的能力；PDF页渲染缺少组件，比较本地渲染组件与外部OCR文件服务：前者增加运行时体积和安全更新负担，后者增加文件外发、费用及服务商依赖。拟优先本地渲染后按需视觉识别。
- [ ] 向用户给出具体拟用组件、锁定版本、官方许可依据、用途、替代方案和影响，获得批准再安装/写依赖。不以生成PDF的ReportLab代替PDF解析。
- [ ] 批准后添加可重复的支持检测测试，确认中文文字、扫描页、公式、DOCX表格和嵌入图可提取；不可完整转换的项目必须返回warnings，不返回伪成功。
- [ ] 未获依赖批准时可以推进其他不依赖解析的任务，但本阶段不能宣称完整交付；不得把全部上传改为手工录入来假装满足规格。

### Task 2: 持久化边界、课程目录及教师AI隔离

**Files:** 新建 schema.py、repository.py、curriculum.py、teacher_ai.py、`backend/app/schemas/teacher_assessment.py`、`backend/scripts/migrate_teacher_assessment.py`、`backend/tests/test_teacher_assessment_schema.py`、`backend/tests/test_teacher_curriculum.py`、`backend/tests/test_teacher_ai_identity.py`。

**Interfaces:** `migrate_assessment_schema(db) -> None`；`AssessmentRepository(path).read()/transaction()`；`resolve_scope(blueprint: ExamBlueprint, profiles: list[dict]) -> Scope`；`TeacherAI.resolve(teacher_id: int, capability: str) -> ProviderRuntimeConfig` 仅供服务端使用，公开状态DTO不含密钥。

- [ ] 写迁移可重复、事务回滚、旧学习数据不变测试；作用域测试中 grade7upper 不接受 grade8/未知知识点，混合教材目标不能自动扩展范围。
- [ ] 写教师AI测试：teacher只读自己的加密配置，admin可用已有服务器配置；未配置返回服务不可用，不能回退为学生配置或无限公共额度；错误输出不含密钥。
- [ ] 确认失败后建表：teacher_assets、teacher_import_jobs、teacher_bank_questions、teacher_bank_versions、teacher_exam_drafts、teacher_exam_reviews、teacher_exam_publications、teacher_test_assignments、teacher_test_submissions、teacher_grade_events、teacher_result_releases。外键/归属/版本/幂等索引写入schema，不只在内存验证。
- [ ] 从 shared/curriculum/g7-upper 六章建立版本化范围，记录知识点及前置关系，公开已支持目录；六升七须单独审核映射后开放，不将六个诊断维度当全部知识点。未知范围可存题但不能发卷。
- [ ] 独立教师配置服务复用 PersonalAPIVault 和模型连接服务；新增教师个人AI配置端点，不通过放宽学生配置身份判断获得管理员权限。前端入口在账号资料中提供。
- [ ] 执行三组新测试，记录目录覆盖范围和未支持项。正式迁移留到任务11。

### Task 3: 安全文件导入与可恢复工作

**Files:** 新建 assets.py、extractors.py、jobs.py、教师路由、`backend/tests/test_teacher_uploads.py`、`backend/tests/test_teacher_import_jobs.py`、`backend/tests/fixtures/teacher_bank/`教学样本；修改 api/router.py 挂载路由。

**Interfaces:** `AssetService.store(teacher_id, filename, content: bytes) -> Asset`；`ImportJobs.enqueue(teacher_id, asset_ids: list[str], request_id: str) -> Job`；`ImportJobs.run_one(worker_id: str) -> bool`；`ImportJobs.status(teacher_id, job_id) -> PublicJob`。模型调用在事务外，写回携带输入revision。

- [ ] 写真实样本测试：混合扫描/文本页、DOCX表格公式/图、旋转图片；核对完整题干和图形引用。超20MB文档/5MB图片/50页/10文件/200题明确拒绝或停在可处理的部分失败，不静默截断。
- [ ] 写恶意签名、HTML伪装图片、ZIP穿越/解压炸弹、带密码PDF、远程关系链接测试；断言没有外部URL访问、无可执行内容输出、错误不暴露文件系统绝对路径。
- [ ] 确认失败后实现受限解码/解析，输出规范JPEG/PNG资源并移除无关元数据。源码文件与教学截图均私有；候选题不能携带任意HTML/SVG/脚本。
- [ ] 实现持久化工作、每教师2并发、超时恢复和手工取消。租约过期工作可重试；按页去重写回，已核对题不覆盖；相同文件哈希和request_id不重复解析扣费。
- [ ] 图片OCR沿用明确配置服务，扩展候选结构但保留“看不清不猜”的行为；无服务保留原文件并提示，不生成虚假题目。
- [ ] 重跑新测试，模拟进程中断后恢复，确认没有永久“处理中”。

### Task 4: 题库审核与上传核对界面

**Files:** 新建 bank.py、`backend/tests/test_teacher_bank.py`；前端 `app/teacher/question-bank/page.tsx`、`[jobId]/review/page.tsx`、`components/bank_editor.tsx`、`bank.module.css`、相关代理和 `frontend/tests/teacher_bank_ui.test.mjs`。

**Interfaces:** `QuestionBank.save(teacher_id, question_id, revision, draft: QuestionDraft) -> QuestionDraft`；`review(..., revision: int) -> ReviewedVersion`；`split(..., revision, parts) -> list[QuestionDraft]`；`merge(..., ids_with_revisions) -> QuestionDraft`；`archive(..., revision) -> None`。

- [ ] 测试教师之间不能访问文件/草稿/答案；并发版本冲突409；缺图/未确认答案/未知课程不能进入ready；修改ready题生成新草稿版本，不改变既有审核版或已发卷。
- [ ] UI先写失败测试：原文和结构化题对照，错误标记有文字；分题/合题、补图、手动添加、重复提示都能操作，手机切换不丢草稿。
- [ ] 实现字段校验和版本审核；仅当前教师的ready版本进入题池，归档不物理删除已被试卷引用的版本/资产。首次上传确认提示文件可能送至已配置视觉服务。
- [ ] 重跑前后端新测试，核对公式/图片出现在学生预览中而非仅显示“配图描述”。

### Task 5: 三档组卷、变式和发布校验

**Files:** 新建 generation.py、exams.py、`backend/tests/test_teacher_generation.py`、`backend/tests/test_teacher_exam_validation.py`；扩充 jobs.py 和课程模型。

**Interfaces:** `ExamService.create_draft(teacher_id, blueprint: ExamBlueprint) -> ExamDraft`；`GenerationJobs.enqueue(teacher_id, exam_id, revision, request_id) -> Job`；`validate_exam(draft: ExamDraft, scope: Scope) -> list[Issue]`；`review_question(teacher_id, exam_id, question_id, revision) -> ExamDraft`。

- [ ] 写四种来源测试：题库充足仅选审核题；不足不默默用AI补题；允许补题才调用教师AI；空库明确AI来源，服务失败保留草稿。变式不能复用未重算的旧答案。
- [ ] 写 regular/advanced/challenge 均拒绝范围外知识点与未知课程测试；缺答案、题数分值错误、扇形图配人数方格图、标注与题干不一致必须产生阻断Issue或人工疑点，疑点未确认不能通过。
- [ ] 确认失败后实现确定性选题和严格JSON候选模型，记录original/variant/ai来源与课程版本；模型声明难度和年级不等于校验通过。
- [ ] 对受支持的数值计算使用受限验证，绝不eval模型表达式；需要语义/图形判断的题要求老师实际预览核对，AI复核只能提供疑点。
- [ ] 写并实现“生成中人工编辑”测试：迟到结果标为stale，不覆盖新revision；取消后不得自动发布；50题上限和目标学生分组校验在模型调用前完成。
- [ ] 重跑新测试；更新teacher题库工作消息，不能出现“100%正确”的承诺。

### Task 6: 发布、撤回与教师试卷界面

**Files:** 扩充 exams.py；新建 `backend/tests/test_teacher_exam_publish.py`；前端 `teacher/exams/page.tsx`、`teacher/exams/[examId]/page.tsx`、`teacher/exams/components/exam_builder.tsx`、`frontend/tests/teacher_exam_builder.test.mjs`。

**Interfaces:** `ExamService.publish(teacher_id, exam_id, revision, request_id) -> {publication_id,assignment_ids}`；`withdraw(teacher_id,publication_id,reason) -> None`。发布在事务内逐个调用基础阶段 `require_link(db,teacher_id,student_id)`，固定整个目标名单，存在失效目标则整体409并提示刷新，不部分偷偷派发。

- [ ] 写未逐题审核不可发布、缺图不可发布、deadline已过不可发布、teacherA不能发teacherB试卷测试；同一请求发布两次assignment数量不增加。
- [ ] 写发布竞态：预览后解除关系则发布失败；新增班级成员不会自动收到旧试卷；所有题目、答案、图形、分值、目录和名单固定快照，题库后续修改不变。
- [ ] 确认失败后实现状态机和版本化审核。题干/答案/图/解析/范围/分值修改使对应审核失效；撤回只取消未完成任务，保留提交和审计。
- [ ] UI实现范围与学生、模式结构、预览审核、发布四步；展示最终人数和名单。只有服务端确认发布成功才显示已发，不用乐观状态冒充。
- [ ] 重跑发布和组件测试，确保教师无权限借此修改历史衔接测评分数。

### Task 7: 学生独立测试、续答和截止

**Files:** 新建 submissions.py、student_teacher_tests.py、`backend/tests/test_teacher_test_submission.py`；前端 `app/teacher-tests/page.tsx`、`[assignmentId]/page.tsx`、`components/teacher_test_session.tsx`、测试代理及 `frontend/tests/teacher_test_session.test.mjs`；学生首页新增小型测试入口。

**Interfaces:** `Submissions.open(student_id,assignment_id) -> PublicAttempt`；`save(student_id,assignment_id,revision,answers: dict) -> PublicAttempt`；`submit(student_id,assignment_id,revision,request_id) -> SubmissionReceipt`；`expire_due(now) -> int`。PublicAttempt无answer/explanation/rubric等私有字段。

- [ ] 写未派发/他人派发拒绝读取；作答响应字段白名单不含答案、原卷和密钥；保存后重开恢复，多标签旧revision409；重复交卷返回原收据。
- [ ] 写截止边界：服务端deadline前保存有效，deadline后拒绝新保存并冻结已存答案；从未开始显示未参加；已开始但未答不形成错题。读取时和后台定期处理都能幂等冻结，不能依赖学生浏览器计时。
- [ ] 确认失败后实现自动保存和服务器版本状态；失网保留当前内存答案与重试说明，不跨账号缓存；交卷前列出未答题，老师建议时长不等同强制倒计时。
- [ ] 解答题附图走本作答私有上传，限制格式/大小并校验student-owner；不复用学生错题上传后偷偷创建错题。
- [ ] 实现解除关联时取消未完成任务；学生保留已有题快照/已发布结果，教师失去读取权限。重新关联不自动复活任务。
- [ ] 重跑新测试与每日学习路线测试，确认首页五步状态和成长值完全不变。

### Task 8: 人工批阅、成绩发布和错题证据

**Files:** 新建 grading.py、`backend/tests/test_teacher_exam_grading.py`；扩充现有 `backend/app/services/wrong_question_collection.py` 的明确来源处理（若需）、`frontend/app/components/wrong_collection_list.tsx` 来源标签；不修改既有判分语义。

**Interfaces:** `Grading.auto_grade(submission_id) -> GradeDraft`；`suggest(teacher_id,submission_id,request_id) -> GradeSuggestion`；`confirm(teacher_id,submission_id,revision,scores,rationale) -> GradeDraft`；`release(teacher_id,publication_id,revision,request_id) -> ReleaseReceipt`；`correct_grade(...,reason,revision) -> GradeDraft`。

- [ ] 写多选完全匹配、数值等价安全归一化、未知符号转人工测试；主观AI建议不能直接成为最终分；无答案、未参加不自动判错。
- [ ] 写release前学生不能看标准答案与正式成绩，测试结束后才允许release；未批完显式返回待批和已判部分，不输出虚假总分。
- [ ] 确认失败后实现每题审核版评分和人工rubric评分，禁止改学生原始答案；revision冲突409，修订必须reason非空，保存旧值/新值及操作者。
- [ ] release时复用可信快照分配与错题收集，来源 teacher_test，事件键由publication/assignment/question/release版本组成；只将明确wrong且有作答证据的结果收集。
- [ ] 写正式订正测试：某题原先wrong后correct，修正该来源证据及统计但保留其他来源错答和纠正历史，不整题删除、不自动标掌握；重复release不重复统计。
- [ ] 教师批阅/下载/统计每次校验有效关系；解除后待批停留等待重新授权，不让系统猜分。
- [ ] 重跑新测试、既有错题集全套及路线验收测试。

### Task 9: 教师结果、学生报告及操作闭环

**Files:** 新建 `frontend/app/teacher/exams/[examId]/results/page.tsx`、`teacher/exams/components/grading_panel.tsx`、`teacher-tests/[assignmentId]/result/page.tsx`、`frontend/tests/teacher_exam_results.test.mjs`；扩充教师学情详情，新增后端结果查询DTO及 `backend/tests/test_teacher_result_privacy.py`。

**Interfaces:** 教师结果查询返回实际参与数、已批数、待批数、已发布成绩分布、每题/每知识点的样本分母及范围；学生结果仅返回自己的已释放部分与错题入口。

- [ ] 写无作答不显示0分、未完成批阅不显示最终平均分、不同难度卷不合并排名、人数分母一致测试；过滤解除关系学生，不能缓存其个体成绩。
- [ ] 写“到期未参加”“部分待批”“成绩已公布”“试卷撤回”真实组件状态测试，结果页可进入对应错题，不跳入老师题库。
- [ ] 确认失败后实现只读统计和图表，分页展示名单，教师逐题批阅界面可对照题目、学生答案与rubric；公布结果按钮显示影响人数并要求确认。
- [ ] 账号切换取消请求，PDF/图片等下载仍通过授权代理；如需额外试卷PDF导出，另行提范围，本计划不擅自添加。
- [ ] 重跑新测试、会话隔离测试和类型检查。

### Task 10: 课程教学质量验收

**Files:** 新建 `docs/教师题库教学验收样例.md`、`backend/tests/test_teacher_exam_content_contract.py`；使用现有可信样本和自建合成教学样本，不擅自外发用户真实文档。

- [ ] 准备每种模式各一份七上已学范围试卷，覆盖单选、多选、判断、填空、解答、公式和图形；记录范围、答案、解法、图文标注及审核理由。
- [ ] 用已知不合格样例验证超纲、缺图、扇形/方格混用、负号括号含义、不可解条件、错误单位、重复选项、错误答案、变式参数不同步都被阻止或明确退回人工；不能用审核勾选跳过硬性结构错误。
- [ ] 通过代码验证的内容和只能人工核对的内容分别记录，不把人工判断包装成自动保证。目录不足的年级仍禁用自动发卷。
- [ ] 若真实AI未配置，测试服务桩只用于异常/状态机测试，必须如实标明真实生成链路未验收，不宣称模型能力已验证。

### Task 11: 完整回归与部署

**Files:** 新建 `docs/教师题库与测试验收记录.md`；更新 README 的已支持文件/年级和启用步骤，不能把草稿需求写成已支持功能。

- [ ] 执行后端完整unittest、前端全部node测试、类型检查、隔离 `.next-teacher-exams-qa` 构建；记录失败并修复，不只报告新增测试。
- [ ] 测试库双身份完成文件导入→审核→三模式生成→审卷→发布→续答→交卷→批阅→公布→错题集→订正全过程；覆盖刷新、双击、失网、跨账号、撤销、窄屏和键盘。
- [ ] 数据库副本迁移验收、最终一致性备份、短暂停写迁移和受控重启，保留备份绝对路径。检查工作进程启动及重启后工作恢复，不留下死任务。
- [ ] 对比旧账号、测评、报告、错题、今日路线和AI模式，确保没有意外修改；不得用旧备份覆盖新增作答回退。
- [ ] 将实际已支持内容、依赖授权/安装状态、真实AI验收状态、可用入口和剩余限制交付用户。教师基础与题库两阶段分别报告完成，不以界面存在代替功能闭环。

## 自查与执行交接

文件和安全限制落在任务1/3，来源与范围在2/5，审核和不可变发布在4/6，作答与撤销在7，评分和错题在8，结果在9，教学质量在10，上线在11。跨任务接口已统一使用 teacher_id、student_id、revision、request_id。

本阶段依赖教师基础阶段完成及解析依赖审批。推荐沿用第一阶段的 Native 执行方式；需用户审阅两个计划并选择方法后开始。当前文档不表示已安装依赖、执行迁移或创建教师账号。
