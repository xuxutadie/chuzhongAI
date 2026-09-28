# 学习数据基础设计

## 目标

补齐完整项目开发文档 Phase 1 中缺失的学习记录与成长值记录数据能力，为后续学生端任务闭环、报告和成长中心提供稳定的数据接口。

## 范围

- 新增 `study_record` 表，保存一次任务执行的开始、完成、学习时长、掌握程度和学生反馈。
- 新增 `growth_record` 表，保存成长值变动的来源、增量和发生时间。
- 新增对应索引与数据库迁移说明；既有表不修改，不删除历史数据。
- 新增 FastAPI 数据契约、持久化仓储和任务完成服务。
- 新增任务开始、任务完成、学习记录查询、成长记录查询四类 API。
- 将任务完成动作组织为单一业务事务：更新任务状态、写学习记录、写成长记录。

本轮不包含用户登录、真实大模型、OCR 上传、前端页面改造、教练端、家长端和 RAG。

## 数据模型

### study_record

每条记录对应一次任务执行。字段包括：`id`、`student_id`、`task_id`、`subject`、`status`、`started_at`、`completed_at`、`duration_minutes`、`mastery_level`、`student_feedback`、`created_at`、`updated_at`。

`status` 仅允许 `in_progress`、`completed`、`abandoned`。完成记录必须提供 `completed_at`，时长不得为负数。

### growth_record

每条记录对应一次可追溯的成长值变化。字段包括：`id`、`student_id`、`source_type`、`source_id`、`delta`、`reason`、`created_at`。

`source_type` 首期仅允许 `task_completion`。同一任务最多产生一条 `task_completion` 成长记录，由数据库唯一约束保证幂等。

## 后端边界

路由层负责校验 HTTP 输入并返回标准响应；业务服务负责状态转换和事务边界；仓储层负责参数化 SQL；Agent 只提供建议，不能直接调用仓储或写入数据库。

数据库连接使用 `psycopg[binary]`。该依赖提供 PostgreSQL 连接和参数化查询，不引入 ORM。连接地址继续由既有 `database_url` 设置读取，不修改 `.env`。

## API 契约

- `POST /api/v1/students/{student_id}/tasks/{task_id}/start`：开始该学生的待办任务，创建或返回进行中的学习记录。
- `POST /api/v1/students/{student_id}/tasks/{task_id}/complete`：完成该学生的任务，接收学习时长、掌握程度和反馈；返回任务、学习记录、成长记录。
- `GET /api/v1/students/{student_id}/study-records`：按时间倒序返回学习记录。
- `GET /api/v1/students/{student_id}/growth-records`：按时间倒序返回成长值流水。

首次完成任务固定增加 10 点成长值。重复完成返回既有完成结果，不重复增加成长值。

## 错误处理

- 任务不存在返回 404。
- 任务归属与学生不一致返回 403。
- 已取消任务不能开始或完成，返回 409。
- 已完成任务再次完成返回已有结果，保持幂等。
- `duration_minutes` 为负数或 `mastery_level` 不在 1 至 5，返回 FastAPI 的请求校验错误。

## 验收与测试

- 数据库迁移可以在空数据库上执行。
- 任务开始后产生进行中的学习记录。
- 首次完成任务写入学习记录和一条 10 点成长记录。
- 重复完成不会生成第二条成长记录。
- 非归属学生不能操作任务。
- 现有 Agent 测试与健康检查保持通过。
