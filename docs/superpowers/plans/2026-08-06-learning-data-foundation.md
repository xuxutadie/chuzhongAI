# 学习数据基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为学习任务提供可持久化的执行记录和成长值流水 API。

**Architecture:** 使用独立 SQL 迁移新增 `study_record` 与 `growth_record`，不修改既有表。FastAPI 路由将请求交给学习服务；服务以一个数据库事务完成任务状态、学习记录、成长记录的更新；仓储层以 psycopg 参数化 SQL 访问 PostgreSQL。

**Tech Stack:** Python 3.10+、FastAPI 0.115+、Pydantic 2、psycopg 3、PostgreSQL、unittest。

---

## 文件职责

- `database/migrations/001_learning_data_records.sql`：新表、约束与索引。
- `backend/app/schemas/learning.py`：HTTP 请求与响应模型。
- `backend/app/repositories/learning_repository.py`：连接、事务与 SQL 数据访问。
- `backend/app/services/learning_service.py`：任务状态转换与成长值业务规则。
- `backend/app/api/routes/learning.py`：学习数据 API。
- `backend/app/api/router.py`：注册学习路由。
- `backend/requirements.txt`：添加 PostgreSQL 驱动。
- `backend/tests/__init__.py`：测试包标记。
- `backend/tests/test_learning_service.py`：服务层行为测试。
- `backend/tests/test_learning_schemas.py`：输入校验测试。
- `backend/tests/test_learning_api.py`：路由与响应测试。

### Task 1: 先定义并验证学习服务行为

**Files:**
- Create: `backend/tests/test_learning_service.py`
- Create: `backend/app/services/learning_service.py`

- [x] **Step 1: 写入失败测试，描述首次完成任务的闭环**

```python
STUDENT_ID = "00000000-0000-0000-0000-000000000001"
TASK_ID = "00000000-0000-0000-0000-000000000011"

def test_complete_task_records_learning_and_growth_once():
    repository = FakeLearningRepository(task_status="in_progress")
    service = LearningService(repository)

    result = service.complete_task(
        student_id=STUDENT_ID,
        task_id=TASK_ID,
        duration_minutes=25,
        mastery_level=4,
        student_feedback="能独立完成",
    )

    assert result["growth_record"]["delta"] == 10
    assert repository.completed_task_ids == [TASK_ID]
    assert repository.study_records[0]["status"] == "completed"
```

- [x] **Step 2: 运行测试并确认因模块不存在失败**

Run: `python -m unittest backend.tests.test_learning_service -v`

Expected: `ModuleNotFoundError`，指出 `LearningService` 尚未定义。

- [x] **Step 3: 最小化实现服务与仓储协议**

```python
class LearningRepository(Protocol):
    def complete_task(self, student_id: str, task_id: str, payload: dict[str, object]) -> dict[str, object]: ...


class LearningService:
    def __init__(self, repository: LearningRepository) -> None:
        self.repository = repository

    def complete_task(self, **payload: object) -> dict[str, object]:
        return self.repository.complete_task(**payload)
```

- [x] **Step 4: 完成最小仓储假实现并确认测试通过**

Run: `python -m unittest backend.tests.test_learning_service -v`

Expected: `OK`。

### Task 2: 固化输入和输出契约

**Files:**
- Create: `backend/tests/test_learning_schemas.py`
- Create: `backend/app/schemas/learning.py`

- [x] **Step 1: 写入失败测试，限制完成反馈的合法范围**

```python
def test_complete_task_request_rejects_invalid_mastery_level():
    with self.assertRaises(ValidationError):
        CompleteTaskRequest(duration_minutes=20, mastery_level=6)
```

- [x] **Step 2: 运行测试并确认模型尚未定义**

Run: `python -m unittest backend.tests.test_learning_schemas -v`

Expected: `ImportError`，指出 `CompleteTaskRequest` 尚未定义。

- [x] **Step 3: 使用 Pydantic 定义模型**

```python
class CompleteTaskRequest(BaseModel):
    duration_minutes: int = Field(ge=0, le=720)
    mastery_level: int = Field(ge=1, le=5)
    student_feedback: str | None = Field(default=None, max_length=1000)
```

- [x] **Step 4: 添加任务、学习记录、成长记录响应模型并确认测试通过**

Run: `python -m unittest backend.tests.test_learning_schemas -v`

Expected: `OK`。

### Task 3: 新增可重复执行的数据库迁移

**Files:**
- Create: `database/migrations/001_learning_data_records.sql`

- [x] **Step 1: 写出迁移验收 SQL**

```sql
SELECT to_regclass('public.study_record') AS study_record_table;
SELECT to_regclass('public.growth_record') AS growth_record_table;
```

- [x] **Step 2: 编写迁移**

```sql
CREATE TABLE IF NOT EXISTS study_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    task_id UUID NOT NULL UNIQUE REFERENCES learning_task(id) ON DELETE CASCADE,
    subject VARCHAR(20) NOT NULL CHECK (subject IN ('chinese', 'math', 'english')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'completed', 'abandoned')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_minutes INTEGER CHECK (duration_minutes >= 0),
    mastery_level SMALLINT CHECK (mastery_level BETWEEN 1 AND 5),
    student_feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [x] **Step 3: 添加成长流水唯一约束和查询索引**

```sql
CREATE TABLE IF NOT EXISTS growth_record (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES student_profile(id) ON DELETE CASCADE,
    source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('task_completion')),
    source_id UUID NOT NULL REFERENCES learning_task(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL CHECK (delta <> 0),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS idx_study_record_student_created_at ON study_record(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_record_student_created_at ON growth_record(student_id, created_at DESC);
```

- [ ] **Step 4: 在可用的开发 PostgreSQL 上执行迁移和验收 SQL**

Run: `psql "$env:DATABASE_URL" -f database/migrations/001_learning_data_records.sql`

Expected: 表和索引创建成功；重复执行不报错。

> 当前状态：待验证。本机未检测到 PostgreSQL 服务或 `psql` 客户端，未执行真实迁移。

### Task 4: 实现 psycopg 仓储与原子完成操作

**Files:**
- Create: `backend/app/repositories/__init__.py`
- Create: `backend/app/repositories/learning_repository.py`
- Modify: `backend/requirements.txt`

- [x] **Step 1: 将失败测试扩展为重复完成不重复奖励**

```python
def test_complete_task_is_idempotent_for_growth():
    first = service.complete_task(student_id=STUDENT_ID, task_id=TASK_ID, duration_minutes=25, mastery_level=4, student_feedback=None)
    second = service.complete_task(student_id=STUDENT_ID, task_id=TASK_ID, duration_minutes=25, mastery_level=4, student_feedback=None)
    assert first["growth_record"]["id"] == second["growth_record"]["id"]
    assert len(repository.growth_records) == 1
```

- [x] **Step 2: 确认测试失败，再实现幂等分支**

Run: `python -m unittest backend.tests.test_learning_service -v`

Expected: 重复完成测试失败，随后在最小实现后通过。

- [x] **Step 3: 加入驱动并实现参数化事务 SQL**

```text
psycopg[binary]>=3.2,<4.0
```

```python
with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
    with connection.transaction():
        task = self._lock_task(connection, student_id, task_id)
        record = self._upsert_completed_record(connection, task, payload)
        growth = self._insert_or_get_growth_record(connection, student_id, task_id)
        self._mark_task_completed(connection, task_id)
return {"task": task, "study_record": record, "growth_record": growth}
```

- [x] **Step 4: 运行服务层全量测试**

Run: `python -m unittest backend.tests.test_learning_service -v`

Expected: `OK`。

### Task 5: 发布学习数据 API

**Files:**
- Create: `backend/app/api/routes/learning.py`
- Modify: `backend/app/api/router.py`
- Create: `backend/tests/test_learning_api.py`

- [x] **Step 1: 写入 API 失败测试，验证完成请求的响应**

```python
response = client.post(
    "/api/v1/students/00000000-0000-0000-0000-000000000001/tasks/00000000-0000-0000-0000-000000000011/complete",
    json={"duration_minutes": 25, "mastery_level": 4, "student_feedback": "能独立完成"},
)
assert response.status_code == 200
assert response.json()["growth_record"]["delta"] == 10
```

- [x] **Step 2: 确认路由不存在导致测试失败**

Run: `python -m unittest backend.tests.test_learning_api -v`

Expected: `404`。

- [x] **Step 3: 实现路由和依赖创建函数**

```python
@router.post("/students/{student_id}/tasks/{task_id}/complete", response_model=CompleteTaskResponse)
def complete_task(student_id: UUID, task_id: UUID, payload: CompleteTaskRequest) -> CompleteTaskResponse:
    return get_learning_service().complete_task(
        student_id=str(student_id), task_id=str(task_id), **payload.model_dump()
    )
```

- [x] **Step 4: 实现开始与查询接口，并将路由挂载到 `/api/v1`**

Run: `python -m unittest discover -s backend/tests -v`

Expected: `OK`。

### Task 6: 完整验证与交付说明

**Files:**
- Modify: `backend/README.md`

- [x] **Step 1: 记录迁移顺序、启动方式和 API 文档地址**

```markdown
1. 先执行 `database/schema.sql`。
2. 再执行 `database/migrations/001_learning_data_records.sql`。
3. 启动后访问 `/docs` 验证学习数据接口。
```

- [x] **Step 2: 安装已批准依赖并运行全部自动测试**

Run: `pip install -r backend/requirements.txt; python -m unittest discover -s backend/tests -v; python -m agents.run_all_tests`

Expected: 全部测试通过。

- [ ] **Step 3: 使用 FastAPI 文档实际调用开始、完成和两类查询接口**

Expected: 首次完成增加 10 点成长值，重复完成不重复增加，记录按时间倒序返回。

> 当前状态：接口已完成注册和契约测试；等待可用 PostgreSQL 及测试学生、任务数据后执行真实调用。

## 自检结果

- 覆盖范围：迁移、数据访问、业务规则、路由、自动测试和运行说明均有对应任务。
- 占位检查：未包含 TBD、TODO 或未指定的实现步骤。
- 类型一致性：`student_id` 与 `task_id` 在路由中以 UUID 接收，在服务与仓储中以字符串传递；完成请求统一使用 `duration_minutes`、`mastery_level`、`student_feedback`。
- 版本控制：当前工作区不是 Git 仓库，因此不执行提交操作。
