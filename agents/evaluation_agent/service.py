from typing import Any

from agents.shared import AgentResult, SupportsGenerate, optional_llm_generate, require_fields, score_level


class EvaluationAgent:
    name = "evaluation_agent"
    required_fields = ["task_completion", "exam_records", "wrong_questions"]

    def __init__(self, llm_gateway: SupportsGenerate | None = None) -> None:
        self.llm_gateway = llm_gateway

    def run(self, payload: dict[str, Any]) -> AgentResult:
        require_fields(payload, self.required_fields)

        completion = payload["task_completion"]
        exam_records = payload["exam_records"]
        wrong_questions = payload["wrong_questions"]
        completed = int(completion.get("completed", 0))
        total = max(1, int(completion.get("total", 1)))
        completion_rate = round(completed / total, 2)

        score_summary = {
            item["subject"]: score_level(item.get("score"))
            for item in exam_records
        }
        weak_subjects = [
            item["subject"]
            for item in exam_records
            if item.get("score") is not None and item["score"] < 70
        ]
        llm_summary = optional_llm_generate(
            self.llm_gateway,
            "请生成客观、具体的周学习成长报告摘要。"
        )

        return AgentResult(
            agent_name=self.name,
            summary="周学习成长报告已生成",
            data={
                "report_title": "周学习成长报告",
                "current_progress": f"本周任务完成率 {completion_rate:.0%}",
                "strengths": [subject for subject, level in score_summary.items() if level == "优势稳定"],
                "weaknesses": weak_subjects,
                "wrong_question_count": len(wrong_questions),
                "next_stage_suggestions": [
                    "继续保持已完成任务的复盘记录",
                    "优先处理低于 70 分学科的基础漏洞",
                    "错题按知识点归类后再安排训练"
                ],
                "llm_summary": llm_summary
            },
            next_actions=["交由教练辅助 Agent 判断是否需要风险提醒"]
        )
