from agents.coach_agent.service import CoachAgent


def test_coach_agent_generates_risk_reminder() -> None:
    result = CoachAgent().run(
        {
            "student": "王同学",
            "task_history": {"consecutive_missed_days": 3, "completion_rate": 0.5},
            "latest_report": {"weaknesses": ["数学", "英语"]}
        }
    )
    assert result.agent_name == "coach_agent"
    assert result.data["risk_level"] == "high"
    assert result.data["risk_reasons"]


if __name__ == "__main__":
    test_coach_agent_generates_risk_reminder()
    print("coach_agent test passed")

