from typing import Any

from agents.shared import AgentResult, SupportsGenerate, optional_llm_generate, require_fields


class TutorAgent:
    name = "tutor_agent"
    required_fields = ["subject", "question"]
    supported_subjects = {"数学", "英语", "语文"}

    def __init__(self, llm_gateway: SupportsGenerate | None = None) -> None:
        self.llm_gateway = llm_gateway

    def run(self, payload: dict[str, Any]) -> AgentResult:
        require_fields(payload, self.required_fields)
        subject = payload["subject"]
        if subject not in self.supported_subjects:
            raise ValueError("第一阶段仅支持数学、英语、语文")

        question = payload["question"]
        knowledge_point = self._guess_knowledge_point(subject, question)
        llm_summary = optional_llm_generate(
            self.llm_gateway,
            f"请围绕{subject}题目生成不直接给答案的引导式教学提示。"
        )

        return AgentResult(
            agent_name=self.name,
            summary="已生成学科辅导基础流程，不直接给出答案",
            data={
                "subject": subject,
                "question": question,
                "knowledge_point_guess": knowledge_point,
                "error_reason_guess": "需要结合学生作答进一步判断",
                "guiding_questions": [
                    "你能先说说这道题考查的核心知识点吗？",
                    "你第一步打算怎么做？为什么？",
                    "有没有哪个条件还没有用上？"
                ],
                "practice_suggestions": [
                    f"补充练习 3 道{knowledge_point}相关基础题",
                    "完成后记录错误原因和订正过程"
                ],
                "direct_answer_policy": "禁止直接输出答案",
                "llm_summary": llm_summary
            },
            next_actions=["如学生提交作答过程，再进入错因分析"]
        )

    def _guess_knowledge_point(self, subject: str, question: str) -> str:
        if subject == "数学":
            if "函数" in question:
                return "函数基础"
            if "方程" in question:
                return "方程求解"
            return "数学基础知识点"
        if subject == "英语":
            if "阅读" in question:
                return "阅读理解"
            if "单词" in question or "词汇" in question:
                return "词汇积累"
            return "英语基础知识点"
        if "文言文" in question:
            return "文言文阅读"
        if "作文" in question:
            return "作文表达"
        return "语文基础知识点"
