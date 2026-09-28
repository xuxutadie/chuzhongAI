# 数据库目录

本目录用于维护 PostgreSQL 数据库结构。

当前阶段提供初始建表脚本与独立迁移文件，不写入真实学生数据，不生成业务报表。

## 使用方式

```bash
psql -d ai_middle_school_coach -f schema.sql
psql -d ai_middle_school_coach -f migrations/001_learning_data_records.sql
```

`001_learning_data_records.sql` 新增 `study_record` 和 `growth_record`，用于任务执行记录与成长值流水。该迁移只创建新表和索引，不修改已有业务表。
