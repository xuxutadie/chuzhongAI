from agents.tutor_agent.service import TutorAgent


def test_tutor_agent_does_not_return_direct_answer() -> None:
    result = TutorAgent().run({"subject": "数学", "question": "一次函数图像怎么判断？"})
    assert result.agent_name == "tutor_agent"
    assert result.data["direct_answer_policy"] == "禁止直接输出答案"
    assert result.data["guiding_questions"]


if __name__ == "__main__":
    test_tutor_agent_does_not_return_direct_answer()
    print("tutor_agent test passed")

