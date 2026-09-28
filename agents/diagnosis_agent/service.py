from typing import Any

from agents.shared import AgentResult, SupportsGenerate, optional_llm_generate, require_fields, score_level


class DiagnosisAgent:
    name = "diagnosis_agent"
    required_fields = [
        "student",
        "grade",
        "school",
        "current_scores",
        "learning_goal",
        "study_habits",
        "subjects"
    ]

    def __init__(self, llm_gateway: SupportsGenerate | None = None) -> None:
        self.llm_gateway = llm_gateway

    def run(self, student_profile: dict[str, Any]) -> AgentResult:
        require_fields(student_profile, self.required_fields)

        scores = student_profile["current_scores"]
        subject_notes = student_profile["subjects"]
        analysis = {}
        recommendations = []

        for subject in ["数学", "英语", "语文"]:
            level = score_level(scores.get(subject))
            note = subject_notes.get(subject, "暂无学科描述")
            analysis[subject] = {
                "level": level,
                "score": scores.get(subject),
                "note": note
            }
            if level in ["明显薄弱", "基础需巩固"]:
                recommendations.append(f"{subject}安排基础知识补漏和错题复盘")
            elif level == "中等可提升":
                recommendations.append(f"{subject}增加专题训练，提升稳定性")
            else:
                recommendations.append(f"{subject}保持优势，加入综合题训练")

        llm_summary = optional_llm_generate(
            self.llm_gateway,
            f"请为{student_profile['student']}生成学生学习诊断报告摘要。"
        )

        return AgentResult(
            agent_name=self.name,
            summary=f"{student_profile['student']}的学习诊断报告已生成",
            data={
                "report_title": "学生学习诊断报告",
                "student": student_profile["student"],
                "grade": student_profile["grade"],
                "school": student_profile["school"],
                "learning_goal": student_profile["learning_goal"],
                "study_habits": student_profile["study_habits"],
                "analysis": analysis,
                "recommendation": recommendations,
                "llm_summary": llm_summary
            },
            next_actions=["交由学习规划 Agent 生成每日计划"]
        )
