# AI Agent 目录

本目录用于搭建 AI 初中学习教练系统的 Agent 智能体基础框架。

## Agent 划分

- `diagnosis_agent/`：学生诊断 Agent，生成学生学习诊断报告。
- `planner_agent/`：学习规划 Agent，根据诊断结果生成每日计划建议。
- `tutor_agent/`：学科辅导 Agent，支持语文、数学、英语基础辅导流程。
- `evaluation_agent/`：学习评价 Agent，生成周学习成长报告。
- `coach_agent/`：教练辅助 Agent，生成风险提醒和沟通建议。

## 文件约定

每个 Agent 目录包含：

- `README.md`
- `prompt.md`
- `service.py`
- `test.py`

## 设计边界

- Agent 只输出结果和建议。
- Agent 禁止直接修改数据库。
- Agent 结果必须经过业务层审核后再保存。
- 大模型调用统一通过 `LLMGateway` 接口扩展。
- 当前阶段不接入真实大模型 API，不开发学生端工作台。

## 测试数据

`test_data/mock_students.py` 内置 5 个模拟学生画像，用于验证不同学习策略。

## 测试方式

```bash
python -m agents.run_all_tests
```
