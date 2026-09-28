# 首页五步与统一错题集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 学生在首页按五步完成当天学习，系统与上传错题进入同一个错题集，依据可信作答逐步完成理解、变式、拓展与间隔复习。

**Architecture:** 每日路线和错题学习分别建服务，复用现有 SQLite、学生鉴权、同源代理、审核题库及 AI 配置。服务端保存题目分配、作答事件和五步核验依据，前端只展示已保存状态；模型不决定数学真值。两批交付共享事件和题目身份，故使用一份集成计划，任务按独立测试边界划分，不顺带重构账号或排课系统。

**Tech Stack:** 现有 Python / FastAPI / Pydantic / SQLite，Next.js 15 / React 19 / TypeScript，Python unittest、Node 内置 test；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-25-wrong-question-collection-design.md`，用户已确认。

状态：实施计划待审阅；所有未勾选项均未实施。计划里的代码是关键实现和测试约束，不代表已写入产品。

## Global Constraints

- “课堂诊断 → 针对学习 → 过关测试 → 错题巩固 → 今日总结”；五步从首次进入首页时就全部展示。
- 完成状态以服务端核验并成功保存为准；直接访问后续链接也须校验前序状态。
- 数学单科；不恢复语文英语入口，不改现有测评评分或课堂任务的过关门槛。
- 系统错题在首次可信判错时收录；入学测评交卷后收录，交卷前不泄题；未作答不计错。
- “本次订正通过”不等于“阶段掌握”；原题、上传图片、原始错答和后续练习记录不因掌握而自动删除。
- 首版不新增成长值奖励；历史补收不触发批量付费 AI 分析、不重算已发布报告。
- 同账号同提交幂等，账号间隔离；不信任客户端的正确性、参考答案、阶段、已掌握字段。
- 历史补收每批最多 200 个事件；每日 1—3 组，未填时长默认 2 组；1、3、7 天间隔，三次不同日期独立复习通过才阶段掌握。
- AI 工作最多自动尝试两次；浏览列表或 GET 请求不启动 AI，不迁移用户历史数据。
- 不新增依赖、不改 `.env`、不自动提交 Git、不删除用户文件；中文界面和关键代码注释。
- 正式库迁移前用 SQLite backup API 备份，在副本验证；只增量迁移，不清库，不重置任何账号。
- 当前目录没有 Git 仓库；每个任务用测试记录和变更清单作检查点，不执行计划模板里的 Git 提交。

## Review Focus

1. 多知识点不能在第一个知识点答完后就错误解锁整日下一步；任务 5 测两个知识点的完整矩阵。
2. 交卷成功与收错题不能只完成一半；任务 3 注入写入异常，验证同事务回滚与重试。
3. 双标签页和切换账号后晚到响应不得串写、重复计数或倒退阶段；任务 2、6、10 覆盖版本冲突与用户上下文。
4. 跨午夜、当日中途换课程和历史草稿缺题不能让路线错绑；任务 4、5、9 固定学习日、课程及可信题目快照。
5. AI 不可用、题型不支持或连续做错时，不能假装掌握，也不能无限加题；任务 7—10 区分求助、当日处理完成与知识掌握。

---

## 实施前核对与交付顺序

工作目录为 `E:/网页html/初中AI助学教练`。下文相对路径均基于该目录，后端测试在 `backend` 目录执行，前端测试在 `frontend` 目录执行。

第一批：任务 1—6，完成可信事件、自动收错题、历史补收、统一列表和首页五步基础引导。第四步的完整分层能力在第二批开放；第一批若单独演示，必须明确显示尚未开放，不能用空按钮或页面浏览冒充完成。正式切换整日新路线要等任务 11 的全链路验收。

第二批：任务 7—11，完成可验证出题、AI 依据分析、分层巩固、每日复习、真实浏览器验收和切换。

首页 UI 可在任务 6 时用隔离测试账号预览，用户无需先完成旧诊断来“激活”新页面。

### 已核对的旧逻辑

- `StudentDashboard` 当前按每日任务数量渲染，数学只有一项，因此实际是 0/1，不是五步。
- `session-engine.ts` 当前按知识点循环诊断、学习、复测；不能直接把旧 `phase` 数字映射成全日五步。
- 后端最终数学任务要求至少 10 道不重复题、正确率 ≥98%、反思至少 8 字。保留此规则，只放到第三步最终核验。
- 衔接测评 `DiagnosisService.submit` 已有 `BEGIN IMMEDIATE`，使用与工作台相同的库；可在同一连接内收集，不需要另起事务。
- 第一章题干目前在前端 TypeScript，第二至六章在共享 JSON；AI 答案登记只有答案并不足以恢复完整题目，需要私有分配快照。
- 旧前端互动题有 `{passed:true}` 答案，不能据此当作可信具体作答。新路线采用登记挑战的真实选择/操作结果核验。

## 文件与接口边界

新增后端文件：

| 文件 | 单一职责 |
| --- | --- |
| `backend/app/repositories/learning_route_repository.py` | 新表迁移、事务、带账号的查询、版本与幂等约束 |
| `backend/app/schemas/learning_route.py` | 公开请求/响应模型，私有答案模型不用于公开响应 |
| `backend/app/services/question_evidence.py` | 可信题目快照、题目身份、判分、公开投影 |
| `backend/app/services/wrong_question_collection.py` | 作答收录、旧记录关联、按账号补收 |
| `backend/app/services/daily_learning_route.py` | 五步阶段证据与顺序、学习日、课程快照 |
| `backend/app/services/wrong_question_practice.py` | 确定性练习模板、判分和分层转移 |
| `backend/app/services/wrong_question_jobs.py` | 持久化 AI 工作、租约、版本缓存和重试 |
| `backend/app/services/wrong_question_review.py` | 每日固定队列与间隔复习 |
| `backend/app/api/routes/learning_route.py` | 新能力鉴权入口，组合上述服务 |
| `backend/scripts/migrate_learning_route.py` | 显式备份、预检、迁移及结果清单 |

新增前端：`app/learning-route/{types.ts,api.ts,model.js,model.d.ts,route.module.css}`、`app/components/{daily_learning_steps.tsx,daily_route_provider.tsx,wrong_question_learning.tsx}`、`app/wrong-questions/[questionId]/page.tsx`、`app/learning-summary/page.tsx`、`app/api/student/learning/[[...parts]]/route.ts`。

### 跨任务固定契约

所有公开接口位于 `/api/v1/me/learning`，BFF 位于 `/api/student/learning`；仅允许下面列出的路径，不实现任意后端转发。

| 方法与路径 | 请求核心字段 | 返回核心字段 |
| --- | --- | --- |
| GET `/route` | 无 | `date,revision,course,steps,current_step,capabilities`；不存在时返回未开始五步，不写库 |
| POST `/route/start` | `request_id` | 固定当天课程及题单后的路线 |
| POST `/route/steps/{step}/start` | `request_id,revision` | 当前活动/已完成回看；未来步 409 |
| POST `/route/steps/{step}/complete` | `request_id,revision,reflection` | 服务端查证据，返回新路线；不接收 `completed:true` |
| POST `/answers` | `event_key,assignment_id,answer` | `event_id,result,collection_id,route_revision` |
| GET `/collection` | `source,knowledge_point,stage,limit,offset` | `items,total,counts` |
| POST `/collection/backfill` | `cursor,limit` | `added,existing,pending,suppressed,unrecoverable,next_cursor` |
| GET `/collection/{id}` | 无 | 原题、来源、历史、当前阶段、已结束答案与分析 |
| POST `/collection/{id}/jobs` | `kind,request_id,evidence_version,stage` | `job_id,status`，异步 202 |
| GET `/jobs/{id}` | 无 | `status,public_result,error,retry_allowed` |
| POST `/jobs/{id}/retry` | `request_id` | 新的手动重试工作编号；必须明确用户动作并通过限流 |
| POST `/collection/{id}/practice/next` | `request_id,revision,stage` | 一道经核验公开题或明确不可用状态 |
| POST `/practice/{id}/hint` | `request_id` | 提示，并在服务端标记不再属于独立作答 |
| POST `/practice/{id}/submit` | `request_id,answer,revision` | 已结束解析、本次结果、当前阶段、下一步 |
| POST `/practice/{id}/report-issue` | `request_id,reason` | 冻结该题晋级，保留历史 |
| POST `/review/start` | `request_id` | 固定本日队列；GET `/review` 只读 |
| GET `/summary` | 无 | 当天真实任务与复习统计、未解决项目；第五步入口校验前序 |

公开作答 `result`：`correct | wrong | skipped | unverified`；练习阶段：`understanding | variant | extension | review | challenge`；集合状态额外有 `pending_verification | mastered`。接口统一复用现有业务错误：401 会话过期、404 不属于本人、409 版本/阶段冲突、422 输入不合法、429 限流；SQL busy 返回可重试状态，不伪造保存成功。

### 新数据结构（任务 1 的迁移依据）

在正式迁移脚本中逐条执行以下 DDL，包装单事务；不要在已开启事务中调用会隐式提交的 `executescript`。JSON 字段写入前经 Pydantic 校验，数字统计不信任 JSON 内客户端字段。

```sql
CREATE TABLE IF NOT EXISTS learning_question_assignments (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, source TEXT NOT NULL,
 source_ref TEXT NOT NULL, question_key TEXT NOT NULL, content_version TEXT NOT NULL,
 private_snapshot_json TEXT NOT NULL, context_json TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(user_id,source,source_ref)
);
CREATE TABLE IF NOT EXISTS question_answer_events (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, event_key TEXT NOT NULL,
 assignment_id TEXT NOT NULL REFERENCES learning_question_assignments(id),
 answer_json TEXT NOT NULL, result TEXT NOT NULL
 CHECK(result IN ('correct','wrong','skipped','unverified')),
 occurred_at TEXT NOT NULL, received_at TEXT NOT NULL,
 UNIQUE(user_id,event_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_learning (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL,
 wrong_question_id INTEGER UNIQUE REFERENCES wrong_questions(id) ON DELETE SET NULL,
 identity_key TEXT NOT NULL, parent_id INTEGER REFERENCES wrong_question_learning(id),
 stage TEXT NOT NULL DEFAULT 'pending_verification',
 evidence_version INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
 wrong_count INTEGER NOT NULL DEFAULT 0, state_json TEXT NOT NULL DEFAULT '{}',
 due_date TEXT, review_passes INTEGER NOT NULL DEFAULT 0, last_pass_date TEXT,
 suppressed INTEGER NOT NULL DEFAULT 0 CHECK(suppressed IN (0,1)),
 UNIQUE(user_id,identity_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_event_links (
 event_id INTEGER PRIMARY KEY REFERENCES question_answer_events(id),
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 disposition TEXT NOT NULL CHECK(disposition IN ('linked','suppressed'))
);
CREATE TABLE IF NOT EXISTS wrong_question_ai_jobs (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 request_key TEXT NOT NULL, kind TEXT NOT NULL, evidence_version INTEGER NOT NULL,
 status TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until TEXT, input_json TEXT NOT NULL,
 result_json TEXT, error_code TEXT, model_metadata_json TEXT, updated_at TEXT NOT NULL,
 UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS wrong_question_practice_items (
 id TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
 learning_id INTEGER NOT NULL REFERENCES wrong_question_learning(id),
 assignment_id TEXT UNIQUE NOT NULL REFERENCES learning_question_assignments(id),
 stage TEXT NOT NULL, validation_status TEXT NOT NULL,
 validator_version TEXT NOT NULL, parameters_hash TEXT NOT NULL,
 hint_used INTEGER NOT NULL DEFAULT 0, frozen INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wrong_question_practice_attempts (
 id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, request_id TEXT NOT NULL,
 item_id TEXT NOT NULL REFERENCES wrong_question_practice_items(id),
 event_id INTEGER UNIQUE NOT NULL REFERENCES question_answer_events(id),
 independent INTEGER NOT NULL, state_before_json TEXT NOT NULL,
 state_after_json TEXT NOT NULL, submitted_at TEXT NOT NULL,
 UNIQUE(user_id,request_id), UNIQUE(user_id,item_id)
);
CREATE TABLE IF NOT EXISTS wrong_question_daily_reviews (
 user_id INTEGER NOT NULL, study_date TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, plan_json TEXT NOT NULL,
 created_at TEXT NOT NULL, PRIMARY KEY(user_id,study_date)
);
CREATE TABLE IF NOT EXISTS daily_learning_routes (
 user_id INTEGER NOT NULL, study_date TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0, course_snapshot_json TEXT NOT NULL,
 state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id,study_date)
);
CREATE INDEX IF NOT EXISTS idx_learning_event_owner ON question_answer_events(user_id,received_at,id);
CREATE INDEX IF NOT EXISTS idx_learning_due ON wrong_question_learning(user_id,suppressed,due_date,id);
CREATE INDEX IF NOT EXISTS idx_learning_jobs ON wrong_question_ai_jobs(status,lease_until,updated_at);
```

分配表是设计中“服务端题目快照”的具体承载，不是新增题库产品。删除错题后保留无题文的身份抑制标记；主动删除是否清理原始内容继续遵循旧删除语义，不能因为学习记录外键导致删除接口崩溃。新表不使用用户外键以保持独立诊断测试兼容，但每个真实服务操作强制从已鉴权用户取 user_id，所有关联 INSERT 必须检查归属，不能仅凭外键视为安全。

---

### Task 1：可恢复迁移与基础数据契约

**Files:** 新增仓储、schemas、迁移脚本（见上表）；新增 `backend/tests/test_learning_route_migration.py`。不在旧仓储初始化中批量转换用户。

**Interfaces:** 仓储模块导出 `migrate_learning_schema(db: sqlite3.Connection) -> None`、`backup_database(source: Path, target: Path) -> None`；`LearningRouteRepository(path)` 不隐式迁移，提供 `transaction()` 上下文，开启短 `BEGIN IMMEDIATE` 并在异常时回滚。

- [ ] 写迁移重复运行、DDL 部分失败回滚、旧错题 id/图片字节不变、备份可重新打开四个测试。核心最小用例：

```python
import sqlite3
import unittest
from app.repositories.learning_route_repository import migrate_learning_schema

class MigrationTests(unittest.TestCase):
    def test_repeat_keeps_old_record(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE wrong_questions(id INTEGER PRIMARY KEY, source_image BLOB)')
        db.execute('INSERT INTO wrong_questions VALUES(7, ?)', (b'original-image',))
        migrate_learning_schema(db)
        migrate_learning_schema(db)
        self.assertEqual(db.execute('SELECT * FROM wrong_questions').fetchall(), [(7, b'original-image')])
        self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
```

- [ ] 运行 `python -m unittest discover -s tests -p test_learning_route_migration.py -v`，确认因新模块未定义失败。
- [ ] 实现上文 DDL、schema 版本记录及备份。备份核心：

```python
def backup_database(source: Path, target: Path) -> None:
    if target.exists() or source.resolve() == target.resolve():
        raise ValueError('备份目标已存在或与原库相同')
    with sqlite3.connect(f'{source.resolve().as_uri()}?mode=ro', uri=True) as src:
        with sqlite3.connect(target) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('备份校验未通过')
```

- [ ] 脚本支持 `--database PATH --backup PATH --check-only` 和 `--apply`；check-only 在临时副本迁移比对，apply 强制先备份、路径绝对化、拒绝覆盖备份，输出计数不输出用户题文/密钥。
- [ ] 重跑测试至通过；本任务不操作正式库。记录新表清单与回滚方式（只停用新入口，不自动覆盖已新增作答的正式库）。

### Task 2：服务端题目快照、可信作答和幂等收集

**Files:** 新增 `question_evidence.py`、`wrong_question_collection.py`、`backend/tests/test_question_evidence.py`、`backend/tests/test_wrong_question_collection.py`；扩展仓储。新增 `shared/curriculum/g7-upper/chapter-1.json`，修改 `frontend/app/math-learning/chapter1-shapes-pack.ts` 与后端 `math_curriculum.py`，只迁移相同题目数据，不改答案。

**Interfaces:**

- `question_identity(question: dict) -> str`：题号 + 内容版本，不含选项展示顺序；参数/图形/答案变化必改版本。
- `grade_answer(snapshot: dict, answer: object) -> str`：返回四种 result。
- `public_question(snapshot: dict) -> dict`：显式白名单，去除答案、解释、校验器内部字段。
- `WrongQuestionCollection(repository).record(db, *, user_id:int, event_key:str, assignment_id:str, answer:object, occurred_at:str) -> dict`：消费已分配题，返回 `event_id,result,collection_id`。相同事件不同内容 409，相同内容重复返回原结果。
- `assign(db, *, user_id:int, source:str, source_ref:str, snapshot:dict, context:dict) -> str`：返回分配 id，稳定 source_ref 去重。

- [ ] 写测试：同题错两次一张卡两条事件；同事件重试计一次；先错后对保留原错误；空答案 skipped；陌生题不记错；另一个账号不能使用分配；改选项顺序同身份、改数值不同身份。独立判分用例：

```python
from app.services.question_evidence import grade_answer, question_identity, public_question

def test_snapshot_contract():
    q = {'id':'test-1','prompt':'2+3=?','options':[{'id':'a','text':'5'},{'id':'b','text':'6'}],
         'answer':'a','explanation':'2+3=5','response_type':'single-choice','diagram':None}
    assert grade_answer(q, 'b') == 'wrong'
    assert grade_answer(q, None) == 'skipped'
    assert question_identity(q) == question_identity({**q, 'options':list(reversed(q['options']))})
    assert 'answer' not in public_question(q)
    assert 'explanation' not in public_question(q)
```

将上例包装为 `unittest.TestCase` 方法；其他任务同样使用 unittest 发现，不混用需要新依赖的测试框架。

- [ ] 运行对应两个测试文件，确认红灯。
- [ ] 提取第一章审核数据到共享 JSON，保留稳定 id、图形、答案，测试前后 JSON 深度一致；静态题分配只能从后端审核注册表取得。公开新路线题单不依赖包含答案的前端题库。旧自由学习展示兼容保留，不扩大“无答案”承诺到所有旧静态资源。
- [ ] 按下列事务顺序实现 record；每项 SQL 都带 user_id，参数化查询：

```python
# 在调用方持有的同一个事务中执行，不另开连接。
# 1. 按 user_id 和 event_key 查旧事件；有则比较 assignment_id/answer 后返回。
# 2. 按 id 和 user_id 读取分配，服务端判分；插入不可变事件。
# 3. wrong：按 user_id 和 identity_key 找集合；首次创建旧 wrong_questions 兼容记录。
# 4. suppressed：只记抑制关联，不重新创建卡；否则关联事件并累计 wrong_count。
# 5. correct/skipped：若原题已收录则追加关联，不清除旧错答，不自动宣布掌握。
# 6. 新错答使 evidence_version 增长；旧 AI 结果保留并显示已过期。
```

- [ ] 登记 AI 题时同时保存完整私有快照，不从前端补写正确答案。上传沿用 OCR 确认后旧 id，首次附加状态为待核实；重复确认请求使用 request_id，不做文本近似自动合并。
- [ ] 已经阶段掌握的原题再次出现可信错答，当前状态返回待理解，重新安排复习；旧掌握日期和通过事件保留在历史中，当前连续复习计数重新开始。仅挑战失败不执行这个降级分支。增加“掌握后再错”和“挑战失败不降级”回归测试。
- [ ] 测试故障插入后的整体回滚、相同 id 不同用户、正文含指令文本只当数据处理；重跑旧题库、AI 答案登记与错题测试。

### Task 3：交卷与练习接入，确保新错题及时收录

**Files:** 修改 `backend/app/services/transition_diagnosis.py`、`backend/app/api/routes/transition_diagnosis.py`、`backend/app/api/router.py`、`backend/app/api/routes/ai_learning.py`；新增 `backend/app/api/routes/learning_route.py`、`backend/tests/test_wrong_question_sources.py`；修改 `frontend/app/components/math_learning_workspace.tsx`、`guided_task_session.tsx`。

**Interfaces:** `collect_submitted_attempt(db, *, user_id:int, attempt_id:str) -> dict` 在 collection 服务中读取已提交冻结试卷，消费任务 2 record；新路由 POST `/answers` 消费分配 id，不接收正确答案；`DiagnosisService` 可注入收集回调，正式 get_service 必须接入，独立旧诊断测试允许不注入。

- [ ] 编写提交 24 题含错答/空答、重复交卷、未交卷查询集合、收集异常的集成测试。核心不变量：

```python
# 测试中沿用 test_transition_diagnosis.py 的临时 DiagnosisService，
# 并通过 collection 回调注入一个抛 RuntimeError 的写入失败。
before = service.get_attempt(1, attempt_id)
with self.assertRaises(RuntimeError):
    service.submit(1, attempt_id, before['revision'])
after = service.get_attempt(1, attempt_id)
self.assertEqual(after['status'], 'active')
self.assertEqual(after['revision'], before['revision'])
```

`attempt_id` 由 `service.start(1)['id']` 取得；用户及资料沿用旧测试先建立。完整测试还要检查新增事件数为零。代码片段嵌入该临时库测试，不连接正式库。

- [ ] 运行 `python -m unittest discover -s tests -p test_wrong_question_sources.py -v` 确认失败。
- [ ] 在原 submit 同事务内冻结报告后收集；已提交重复调用也能幂等补齐，不重新判定/覆盖旧报告。事件键使用 `transition:{attempt_id}:{question_id}`，从冻结选项恢复当时选择，不用当前题库选项替代。
- [ ] 日常新路线每次确认作答生成一个 UUID 并入待同步队列，成功才移除；用户重试复用 UUID。队列以 `user_id + study_date + assignment_id` 隔离；退出账号清理内存，不把旧队列发给新账号。日期来自服务端。
- [ ] 旧 guided 数学活动通过已登记题目适配器接入；未登记、不含真实选项的活动不伪造证据，显示未覆盖来源。互动具体覆盖在任务 6 补齐。
- [ ] 服务端记录成功后 UI 才提示“已加入错题集”；网络失败保留答案与“待同步”，不显示已收录。不等最终 98 分任务完成才提交。
- [ ] 重跑入学测评、课程上下文、会话切换和旧工作台 API 测试，核对报告 JSON 字节没有被补收改写。

### Task 4：历史补收、列表分页和删除抑制

**Files:** 扩展 collection 服务、schemas 和 learning_route 路由；修改旧 `student_workspace_service.py` 删除边界；新增 `backend/tests/test_wrong_question_backfill.py`。

**Interfaces:** `backfill(user_id:int, cursor:str|None, limit:int=200) -> dict`；`list_collection(user_id:int, filters:dict, limit:int, offset:int) -> dict`；`suppress(db,user_id:int,question_id:int) -> None`。游标只含版本、来源、稳定最后 id；严格校验来源和范围，不接受用户自选 SQL 或 user_id。

- [ ] 测试 205 条事件分两页、重复页、插入新记录不漏旧记录、旧草稿未知题进入 pending、其他账号不可补收、删除后补收不复活。统计断言：

```python
first = collection.backfill(user_id=1, cursor=None, limit=200)
repeat = collection.backfill(user_id=1, cursor=None, limit=200)
self.assertEqual(first['added'], 200)
self.assertEqual(repeat['added'], 0)
self.assertEqual(repeat['existing'], 200)
self.assertIsNotNone(first['next_cursor'])
```

该用例在临时库建立 205 个已交卷错答分配/来源，不把用户正式测评作为 fixture。

- [ ] 运行 `python -m unittest discover -s tests -p test_wrong_question_backfill.py -v` 确认失败。
- [ ] 按 `(source_rank, stable_source_id, question_index)` 前进，初次游标记录来源上界使处理中新增数据不改变本轮范围。`mathSessions` 以账号内快照版本、会话 id、题号、轮次、作答时间形成稳定事件键；客户端 correct 忽略。缺参考答案但有题文存待核实；仅有无法还原题号存恢复失败统计，不创造空白题。
- [ ] 总数和来源/状态统计按相同账号、过滤器计算，后台分页；旧列表接口兼容。上传题左关联缺失新状态时返回 pending，不在 GET 隐式迁移。
- [ ] 删除前在同事务设置 suppressed 并移除个人题文/图片（沿用明确确认后的删除范围），保留不可还原题文的身份指纹及去重键；事件正文按删除规则清除，不能在卡片消失后仍通过历史接口读取。主外键采用 SET NULL 允许旧 id 删除。
- [ ] 重跑图片访问、旧 CRUD、分页权限和补收测试；比对旧分数/报告/完成日期未改变。

### Task 5：服务端五步路线与多知识点阶段编排

**Files:** 新增 `daily_learning_route.py`、`backend/tests/test_daily_learning_route.py`；扩展 schemas/routes/repository；修改旧任务完成边界用于原子核验；前端新增路线 model/types。

**Interfaces:** `route_view(user_id:int, now:datetime) -> dict` 只读；`start_route(user_id:int, request_id:str, now:datetime) -> dict`；`complete_step(user_id:int, step:int, revision:int, request_id:str, reflection:str) -> dict`。`state_json` 固定包含 `steps,assignments,learning_targets,receipts,legacy_task_receipt`，每步 `status,evidence_ids,started_at,completed_at`，receipts 用于请求重试。当前阶段完全由后端计算。

- [ ] 测试初始五步、第一步错一半仍可完成、少答一道不能完成、两个知识点只完成一个不解锁第二步、伪造 passed/题号失败、未来步骤 409、重复完成不计双奖、跨日与课程快照固定。
- [ ] 明确阶段归属，按以下表实现，不复用旧 session.phase 作为整日状态：

| 步骤 | 服务端可核验依据 | 流程 |
| --- | --- | --- |
| 1 | 固定课程每个已选知识点审核诊断题单全部收到有效作答 | 先完成所有选中知识点首轮，再进入第二步；保留原每包 10 题，不暗改题量 |
| 2 | 每个薄弱点对应审核讲解/互动活动记录 + 学生针对该内容的学习回应 | 页面打开或倒计时不算；不把回应认作掌握测试；全对时安排简短方法回顾，不阻断第三步 |
| 3 | 所选知识点独立过关题及旧任务核验通过、至少 8 字反思 | 保留每包 98 分通过、至少 10 题及最终任务规则；未过关返回相关讲解，整日仍停第三步 |
| 4 | 本日固定队列每组的本阶段处理回执 | 由任务 9 接入；队列为空服务端记录无需订正，不由浏览器声明 |
| 5 | 前四步已处理，服务端汇总已生成且用户明确确认结束 | 只完成当天路线，不增加成长值；历史回看不重复提交 |

- [ ] 使用服务器时间，上海学习日工具不依赖新增 tzdata：

```python
from datetime import datetime, timedelta, timezone

def study_date(now: datetime) -> str:
    if now.tzinfo is None:
        raise ValueError('需要带时区的时间')
    # 当前产品学习日采用上海现行 UTC+8；不处理历史夏令时日期。
    return now.astimezone(timezone(timedelta(hours=8))).date().isoformat()
```

测试 `2026-09-25T15:59:59+00:00` 是 25 日、`16:00:00` 是 26 日。旧未同步事件写回其分配日，不偷偷算入新日任务。

- [ ] 实现乐观锁与请求回执，幂等检查在 revision 判断之前：

```python
# 同一事务内按本人和学习日读取路线。
if request_id in state['receipts']:
    return state['receipts'][request_id]
if revision != stored_revision:
    raise ResourceConflictError('进度已更新，请载入已保存内容')
if any(s['status'] not in ('completed', 'not_required') for s in state['steps'][:step-1]):
    raise ResourceConflictError('请先完成前一步')
# 再从服务端事件核验本步证据；写状态、回执、revision+1，不采用请求体完成标记。
```

- [ ] 为新每日路线新增前端控制状态 `step + knowledgePointIndex + assignmentId`，复用题目/讲解展示组件，不更改旧自由学习 session-engine 的行为。路线题单从 API 来；不能加载某章就悄悄退回正方体默认题。
- [ ] 旧记录接入：已完成的旧整项任务作为前 1—3 步兼容凭证展示“历史任务已核验”，不再授奖；未完成旧草稿只导入可重判的事件，无法还原的学习过程说明需继续，不强制清空旧草稿。课程当日开始后固定，新选择下一学习日生效；不覆盖已作答题单。
- [ ] 运行新测试及 `test_student_workspace_api.py`，验证旧 final completion 门槛保持；重复提交路线与旧任务不会让成长值翻倍。

### Task 6：首页五步、互动实答和统一错题集界面

**Files:** 新增前端文件（见边界表）、`frontend/tests/daily_learning_route.test.mjs`、`wrong_collection_navigation.test.mjs`；修改 `student_dashboard.tsx`、`math_learning_workspace.tsx`、`interactive_lesson_player.tsx`、`wrong_question_workspace.tsx`、`wrong_question_record_card.tsx`、`workspace_navigation_model.js`、`app/wrong-questions/page.tsx`、`app/student-api.ts`。对应互动脚本仅修改已登记的数学课件，不扫描改写无关课件。

**Interfaces:** `routeCards(route)` 返回五个 `{step,title,status,action,disabled,reason}`；`DailyRouteProvider` 提供 `route,loading,error,startStep,completeStep,refresh`；返回值均等待服务端，不做乐观解锁。API 模块所有请求携带现有预期账号头。

- [ ] Node 测试：固定五标题、当前步可点击、未来步 disabled、已完成仅回看、空课程仍保留五步并提示选课、保存失败不推进。核心用例：

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCards } from '../app/learning-route/model.js';
test('首次到首页就能看到五步', () => {
  const cards = routeCards({current_step:1, steps:[]});
  assert.deepEqual(cards.map(x => x.title), ['课堂诊断','针对学习','过关测试','错题巩固','今日总结']);
  assert.equal(cards[0].action, '开始');
  assert.ok(cards.slice(1).every(x => x.disabled));
});
```

- [ ] 执行 `node --test tests/daily_learning_route.test.mjs tests/wrong_collection_navigation.test.mjs`，确认失败。
- [ ] 首页去掉占据大面积的重复任务描述/0/1统计，把五个紧凑步骤作为主区；当前步一个主按钮，已完成“回看”、未来步“完成第 N 步后解锁”，次区只保留错题集和必要状态。视觉用既有配色，小屏竖排，不引入 UI 库。
- [ ] 在 BFF 实现严格路径+方法白名单，沿用 `relayAuthenticatedRequest`；不允许 `..`、其他用户 id 或任意后端 URL。POST 参数由 Pydantic forbid extra 防止自报结果字段。
- [ ] 完成本步展示“已完成，进入第 N 步”；新路线先判断授权步骤再加载后续题，不只靠按钮禁用。旧自由学习入口不会冒充每日步骤已完成。
- [ ] 错题集主按钮“继续今天的错题复习”，上传作为次级入口；来源、累计错答次数、最近日期、阶段、服务器总数及筛选可见，补收有进度/失败重试。范围内所有“错题本”文案改名，旧路由不变。
- [ ] 互动课件新增数据协议 `math-answer-submitted`：`lessonId,challengeId,assignmentId,answer,eventKey`；父页面验证 iframe source、origin、服务端登记活动。后端只从可信映射判分，不接受 `passed:true`。为第一至六章正式数学即时挑战建立共享题目/操作目标清单，逐项验收；不具备真实作答的纯动画仅登记学习过程，不记录错题。
- [ ] 新增 `backend/tests/test_interactive_answer_evidence.py` 和前端消息测试：伪造其他窗口、错误 origin、无映射挑战拒绝；同一挑战真实错答入集合。保留旧完成消息兼容，但其不能单独生成错答事件。
- [ ] 测试类型、已有导航/会话切换、手机布局。此时在隔离测试环境展示首页，第四步如第二批未完成则明确“分层巩固尚未开放”，不得报告全流程完工。

### Task 7：确定性练习与分层学习状态机

**Files:** 新增 `wrong_question_practice.py`、`backend/tests/test_wrong_question_practice.py`、`shared/curriculum/wrong-practice-templates.json`；扩展 schemas/repository。

**Interfaces:** `build_verified_question(template_id:str, parameters:dict, stage:str) -> dict` 返回私有快照；不支持抛业务错误。`advance_practice(state:dict, result:str, independent:bool, parameters_hash:str, stage:str) -> dict` 为纯函数。`next_practice(user_id:int, learning_id:int, request_id:str, revision:int, stage:str) -> dict` 和 `submit_practice(user_id:int, item_id:str, request_id:str, revision:int, answer:object) -> dict` 返回公开题/判分；内部调用任务 2 record。

- [ ] 写测试理解通过进入变式、两道不同参数首次独立正确进入拓展、提示后正确不计独立、重复题不刷次数、连续两错转求助、挑战不降低基础状态、题目异议冻结。

```python
state = {'stage':'variant', 'independent_hashes':[], 'consecutive_errors':0}
once = advance_practice(state, 'correct', True, 'params-a', 'variant')
self.assertEqual(once['stage'], 'variant')
again = advance_practice(once, 'correct', True, 'params-a', 'variant')
self.assertEqual(again['stage'], 'variant')
twice = advance_practice(again, 'correct', True, 'params-b', 'variant')
self.assertEqual(twice['stage'], 'extension')
```

- [ ] 运行测试确认失败；先做有理数加减、分数/比例、面积与体积、数据统计比例这四组确定性模板，并登记知识点映射。其他题型明确 unsupported，不自动套近似模板。
- [ ] 模板规范：`template_id,knowledge_points,stages,parameter_bounds,validator_version`；模型只可选择已有模板和界内参数。整数/分数用标准库 `Fraction`，正确答案、干扰项、讲解和图形全部同源计算。单选排除重复选项，多选严格集合比较，不给宽松字符串 eval。
- [ ] 扇形题同源示例与测试：

```python
from fractions import Fraction
ratio = Fraction(part, total)
percent = ratio * 100
angle = ratio * 360
if not (0 < part < total and total <= 200):
    raise ValueError('扇形数据超出审核范围')
# diagram 使用现有安全图元，由 angle 决定扇区，不把 percentage 直接写在待求图中。
```

测试 part=10,total=40 必为 25% / 90°；图例人数与扇区同源，零分母、超范围、文本注入、重复正确选项拒绝。理解/变式/拓展使用明确不同教学目标，不仅换颜色；挑战限于登记且有解的模板组合。
- [ ] 单题只接受一次正式提交；错后想重做生成新题，不覆盖初次答案；点提示服务端先落库再返回提示。请求幂等+版本核验+作答+阶段推进同事务；母题下记录变式错答，不无限新建主卡。
- [ ] 修改题干或新增错答使旧分析失效，但不覆盖旧练习快照。保存原题、上传图、全部练习历史；单次正确只显示“本次订正通过”。
- [ ] 运行模板参数边界遍历与新测试，复跑原扇形图回归，正确答案只在 submit 响应中出现。

### Task 8：有依据的 AI 分析与可恢复工作队列

**Files:** 新增 `wrong_question_jobs.py`、`backend/tests/test_wrong_question_jobs.py`；修改 `ai_runtime_config.py`、`main.py` lifespan 入口，扩展路由。不要新增外部队列依赖。

**Interfaces:** `analysis_input(snapshot:dict, events:list[dict], evidence_version:int) -> dict`；`request_job(user_id:int, learning_id:int, kind:str, request_id:str, evidence_version:int, stage:str|None) -> dict`；`run_one_job(now:datetime) -> bool` 供后台短轮询调用；`lease_job` 与 `finish_job` 是仓储方法，完成必须匹配 user/job/version/lease_token。

- [ ] 使用假 AI 客户端测试隐私白名单、无解题过程时待确认、持久化请求去重、第二次失败后停止、旧租约结果丢弃、修改题目后迟到结果只留历史不生效、账号服务归属与限流。

```python
payload = analysis_input(
    {'prompt':'2+3=?','answer':'5','options':[], 'diagram':None, 'username':'secret'},
    [{'answer':'6','result':'wrong','steps':None,'display_name':'学生姓名'}], 2)
self.assertNotIn('secret', json.dumps(payload, ensure_ascii=False))
self.assertNotIn('学生姓名', json.dumps(payload, ensure_ascii=False))
self.assertEqual(payload['events'][0]['answer'], '6')
```

- [ ] 运行测试红灯后实现白名单输入：`question,options,diagram,reference_answer,events[{answer,result,steps}],evidence_version`。没有可信答案时标 `verification_status`，不把模型参考解法当作既有事实。
- [ ] 输出模型包含 `knowledge_points,question_type,method,observed_facts,possible_causes[{claim,evidence_event_ids,confidence}],clarifying_question,hints,next_action`；事件引用必须属于当前母题，缺少支持就降为待确认。任何不在题目里的分数/学生能力判定不得展示为事实。
- [ ] 工作键包含题版本、证据版本、kind、stage、模板版本；不会把另一阶段旧题返回。DB 短事务领取租约（例如 120 秒），事务外调用现有账号 AI 配置，结果校验后再短事务写回。关键提交条件：

```sql
UPDATE wrong_question_ai_jobs SET status='completed',result_json=?,updated_at=?
WHERE id=? AND user_id=? AND status='running' AND lease_token=?
 AND evidence_version=?;
```

- [ ] 用现有 FastAPI lifespan 启动一个可停止 worker，避免多 worker 重复消费靠 DB 租约仲裁；关闭时停止领取、在途任务靠租约恢复。不要把真实请求只交给易丢失的浏览器或内存任务。最多两次自动尝试，手动重试必须产生明确新操作并限流，不保证外部供应商绝无重复收费。
- [ ] 生成结果走任务 7模板校验；模型失败有匹配审核题则显示“审核题库练习”，没有则说明暂不可自动出题。列表访问/历史補收不创建工作。测试全部使用 fake AI，不擅自消耗正式账号额度。
- [ ] 重跑旧 AI 配置/限流/传输安全测试，检查异常信息无密钥或完整供应商响应。

### Task 9：固定每日复习队列与间隔掌握

**Files:** 新增 `wrong_question_review.py`、`backend/tests/test_wrong_question_review.py`；扩展每日路线第四步。

**Interfaces:** `daily_limit(minutes:int|None) -> int`；`next_review_date(day:date, completed_reviews:int) -> date|None`；`start_review(user_id:int, request_id:str, now:datetime) -> dict`；`record_daily_outcome(db,user_id:int,learning_id:int,outcome:str,evidence_id:str,now:datetime) -> None`。

- [ ] 测每日时长边界、到期优先、同优先级稳定排序、初次第四步才固定、刷新不加量、当日后来新错题进下一计划、同日多答不刷间隔成功次数。纯函数测试：

```python
self.assertEqual([daily_limit(x) for x in (None, 5, 20, 90)], [2,1,2,3])
self.assertEqual(next_review_date(date(2026,9,25), 0), date(2026,9,26))
self.assertEqual(next_review_date(date(2026,9,26), 1), date(2026,9,29))
self.assertEqual(next_review_date(date(2026,9,29), 2), date(2026,10,6))
self.assertIsNone(next_review_date(date(2026,10,6), 3))
```

- [ ] 运行测试红灯后实现队列：先 due_date <= today 的复习，再反复错误，再新题；稳定 id 兜底，已抑制不入队。固定 `{learning_id,stage,assigned_at,outcome,evidence_ids}`，不得在每次 GET 重排。
- [ ] 实现规则：基础巩固过后次日复习，通过再隔 3 天、7 天；三次不同日期独立通过才 mastered。失败回相关讲解，明日再安排，保持旧历史；不得同日靠提示重复答刷成三次。
- [ ] 当日“处理完成”与“通过”分离：队列条目 outcome 为 `passed | needs_help | awaiting_verification | deferred_unavailable`。后两者必须由服务端真实无校验器/AI 失败证据产生，并让学生看到说明，不提供任意“跳过所有错题”接口。连续两错后的求助回执结束当日该组，保留待复习，不冒充掌握。今日总结明确显示未解决数量。
- [ ] 队列真正为空服务端记第四步 not_required；有条目须逐组获得上述真实处理回执，才可进入总结。挑战不入基础队列，不影响每日完成。
- [ ] 测试午夜错题提交计入原分配日，已逾期不惩罚加量；参数 now 由服务器注入而非客户端传。对错误配置/负时长使用默认值并记录非敏感诊断信息。

### Task 10：错题学习页面与五步完整衔接

**Files:** 完成 `wrong_question_learning.tsx`、单题 page、summary page、路线 provider；新增 `frontend/tests/wrong_question_learning.test.mjs`、`daily_review_model.test.mjs`，扩展导航测试。

**Interfaces:** 单题 API 消费任务 7—9；页面状态使用 `loading | active | saving | failed | needs_help | unavailable | completed`，而不是用 null 同时代表加载中和没有错题。`revision` 来自服务端，冲突重新读取，不盲目覆盖。

- [ ] 测试原题与学生原答展示、提交前无答案、提示后独立性变化、提交失败保留输入、恢复同一道分配题、错误不显示成功、晚到响应按账号和 request epoch 忽略。
- [ ] 运行前端新测试确认失败，然后实现一个主行动的布局：

```tsx
<section aria-labelledby="practice-title">
  <p>今天第 {groupIndex + 1} / {groupCount} 组</p>
  <h1 id="practice-title">{stageTitle}</h1>
  <p role="status" aria-live="polite">{saveMessage}</p>
  <button type="button" disabled={saving || !answerReady} onClick={submitAnswer}>
    {saving ? '正在保存…' : '提交答案'}
  </button>
</section>
```

上述变量由组件读取公开题、固定队列和本地草稿；submitAnswer 只在服务器成功后清空输入和切换下一题。辅助“看提示”“我有疑问”不与主按钮争抢视觉重点。
- [ ] 展示原题卡、AI 观察与待确认错因（明确区分）、理解检查/变式/拓展当前步；挑战单列“可选，不影响今日完成”。原题历史可看，本轮答案不能通过 SSR HTML、API raw payload 或无障碍文本提前出现。
- [ ] 从首页第四步进今日队列，处理一组后只有“继续下一组”；最后“进入今日总结”。每日总结按服务端事件区分已订正、需帮助、待核实、阶段掌握，不使用 0/1 老任务数量冒充五步完成率。
- [ ] 完成第五步显示“今天完成了”，保留回看/可选挑战；错题集可独立进入历史和额外练习，但不绕过每日路线前序锁定。
- [ ] 执行新测试、完整 Node 测试和 TypeScript 检查；断网时不显示已完成，移动端无横向溢出且键盘可操作所有步骤。

### Task 11：副本演练、回归与正式切换

**Files:** 新增 `docs/五步学习与错题集验收_2026-09-25.md`、`backend/tests/test_learning_route_end_to_end.py`；记录测试库截图路径、覆盖范围和仍不支持的题型，不记录真实账号密钥。

**Interfaces:** 使用上文公开 API 完整走通，不直接用 SQL 改状态当验收。

- [ ] 临时库建立两个学生、一个教师及一张旧上传图，完整跑“诊断错答→自动收录→针对学习→过关→理解→下日变式→拓展→三次间隔复习→仍可查到母题”。fixture 提供可注入服务端时钟，禁止修改电脑时间。
- [ ] 后端执行 `python -m unittest discover -s tests -v`；前端执行 `node --test tests/*.test.mjs`（若环境 Node 不展开通配符，先用 PowerShell 获取测试文件列表再传数组）与 `npm run type-check`。测试记录实际通过数量和失败项，不沿用历史数量。
- [ ] 检查实际监听服务的 cwd 与构建目录；停止本项目开发进程后再运行 `npm run build`，或使用明确隔离输出目录。不要在共享 `.next` 上同时 dev/build，也不要结束其他项目进程。
- [ ] 按浏览器技能在隔离测试账号做桌面 1440px 和手机 390px 验收：首次首页五步都在、逐步解锁、未完成不能直达未来步骤、后台刷新恢复、断网重试、切换账号、双标签页、AI 未配置、有图片错题、饼图/扇形同源、过期题冻结。不得替真实学生提交答案以造进度。
- [ ] 正式迁移前用脚本 check-only 演练，核对数据库绝对路径、备份目标、旧 id/图片校验及报告摘要；向用户说明将新增哪些表、不会重置什么。只在已授权正式切换范围内 apply，不扫描修改全体历史答卷。
- [ ] 正式数据库迁移后重启本项目服务，做只读健康和当前页面检查；历史补收通过学生当前账号按钮按批触发，不擅自补收全部账号。新记录从此自动收集。
- [ ] 切换失败先停用新路由并保留新表与备份，不自动回滚覆盖已产生的新答卷；定位失败后恢复。备份恢复必须核对恢复后会丢失的时间区间并另获确认。
- [ ] 最终交付用户可见首页链接、错题集入口、五步完成路径、支持来源和暂不支持题型。只说已实际测试的结果，不把第一批或设计文档当全功能上线。

## 自查与覆盖清单

| 已确认设计 | 计划落实位置 |
| --- | --- |
| 首屏五步、简短按钮、按序解锁、保存重试 | 任务 5、6、10 |
| 不降低旧门槛、不重复授奖、多知识点 | 任务 5、11 |
| 系统/上传/手动统一，旧图片保留 | 任务 2—4、6 |
| 实答可信、交卷不泄露、互动具体映射 | 任务 2、3、6 |
| 幂等、身份版本、补收 200、删除抑制、账号隔离 | 任务 1—4 |
| AI 真实依据、版本缓存、持久化两次重试与费用边界 | 任务 8 |
| 模板可复算、题图一致、未支持题型透明 | 任务 7、8 |
| 理解/变式/拓展/可选挑战/提示/连续出错 | 任务 7、9、10 |
| 固定每日数量与队列、1/3/7 日、掌握仍保留 | 任务 9 |
| 备份、副本、旧报告不变、真实浏览器与恢复 | 任务 1、3、11 |

## 执行方式与审阅门槛

建议在当前任务由主代理连续实施，每个任务先写失败测试、实现后回归，按两批给用户展示，全部完成后进行一次独立复核；这项工作接口依赖紧密，保持上下文有助于避免每日路线和错题状态不一致。也可选择逐任务分代理实施与独立复核，检查更细但协调成本更高。用户尚未选择方式，本轮不调度代理、不修改业务代码、不迁移正式数据库。

本文经用户审阅并选择执行方式后，再读取相应执行技能实施；不要再次请求已经确认的设计范围。
