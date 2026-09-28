from typing import Any

from agents.shared import AgentResult, SupportsGenerate, optional_llm_generate, require_fields


class CoachAgent:
    name = "coach_agent"
    required_fields = ["student", "task_history", "latest_report"]

    def __init__(self, llm_gateway: SupportsGenerate | None = None) -> None:
        self.llm_gateway = llm_gateway

    def run(self, payload: dict[str, Any]) -> AgentResult:
        require_fields(payload, self.required_fields)

        task_history = payload["task_history"]
        missed_days = int(task_history.get("consecutive_missed_days", 0))
        completion_rate = float(task_history.get("completion_rate", 1))
        latest_report = payload["latest_report"]

        risk_level = "low"
        reasons = []
        if missed_days >= 3:
            risk_level = "high"
            reasons.append("连续多天未完成学习任务")
        elif completion_rate < 0.7:
            risk_level = "medium"
            reasons.append("本周任务完成率偏低")

        if latest_report.get("weaknesses"):
            reasons.append("存在需要持续跟进的薄弱学科")
        llm_summary = optional_llm_generate(
            self.llm_gateway,
            f"请为教练生成关于{payload['student']}的风险沟通提醒。"
        )

        return AgentResult(
            agent_name=self.name,
            summary=f"{payload['student']}的教练辅助提醒已生成",
            data={
                "student": payload["student"],
                "risk_level": risk_level,
                "risk_reasons": reasons or ["暂无明显风险"],
                "coach_suggestions": [
                    "与学生确认本周任务未完成原因",
                    "根据可用时间调整计划强度",
                    "优先跟进薄弱学科的基础任务"
                ],
                "llm_summary": llm_summary
            },
            next_actions=["教练审核后决定是否沟通或调整计划"]
        )
