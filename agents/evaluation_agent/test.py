from agents.evaluation_agent.service import EvaluationAgent


def test_evaluation_agent_generates_weekly_report() -> None:
    result = EvaluationAgent().run(
        {
            "task_completion": {"completed": 8, "total": 10},
            "exam_records": [
                {"subject": "数学", "score": 68},
                {"subject": "英语", "score": 82}
            ],
            "wrong_questions": [{"subject": "数学"}, {"subject": "英语"}]
        }
    )
    assert result.agent_name == "evaluation_agent"
    assert result.data["report_title"] == "周学习成长报告"
    assert result.data["wrong_question_count"] == 2


if __name__ == "__main__":
    test_evaluation_agent_generates_weekly_report()
    print("evaluation_agent test passed")

