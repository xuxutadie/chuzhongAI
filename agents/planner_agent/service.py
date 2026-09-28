from typing import Any

from agents.shared import AgentResult, SupportsGenerate, optional_llm_generate, require_fields


class PlannerAgent:
    name = "planner_agent"
    required_fields = ["diagnosis_result", "available_time_minutes", "learning_goal"]

    def __init__(self, llm_gateway: SupportsGenerate | None = None) -> None:
        self.llm_gateway = llm_gateway

    def run(self, payload: dict[str, Any]) -> AgentResult:
        require_fields(payload, self.required_fields)

        minutes = int(payload["available_time_minutes"])
        diagnosis = payload["diagnosis_result"]
        recommendations = diagnosis.get("recommendation", [])
        slot_count = max(1, min(3, minutes // 25))
        selected = recommendations[:slot_count]

        daily_plan = [
            {
                "task": item,
                "duration_minutes": max(20, minutes // max(slot_count, 1)),
                "review_method": "完成后记录错因和掌握程度"
            }
            for item in selected
        ]
        llm_summary = optional_llm_generate(
            self.llm_gateway,
            f"请根据目标{payload['learning_goal']}优化每日学习计划表达。"
        )

        return AgentResult(
            agent_name=self.name,
            summary="每日学习计划已生成，等待业务层审核",
            data={
                "learning_goal": payload["learning_goal"],
                "available_time_minutes": minutes,
                "daily_plan": daily_plan,
                "planning_note": "第一阶段为规则化计划框架，后续可接入大模型优化表达",
                "llm_summary": llm_summary
            },
            next_actions=["业务层审核后写入 learning_task"]
        )
