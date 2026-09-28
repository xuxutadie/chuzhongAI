from agents.diagnosis_agent.service import DiagnosisAgent
from agents.planner_agent.service import PlannerAgent
from agents.test_data.mock_students import MOCK_STUDENTS


def test_planner_agent_generates_daily_plan() -> None:
    diagnosis = DiagnosisAgent().run(MOCK_STUDENTS[1])
    result = PlannerAgent().run(
        {
            "diagnosis_result": diagnosis.data,
            "available_time_minutes": 90,
            "learning_goal": MOCK_STUDENTS[1]["learning_goal"]
        }
    )
    assert result.agent_name == "planner_agent"
    assert result.data["daily_plan"]
    assert result.next_actions == ["业务层审核后写入 learning_task"]


if __name__ == "__main__":
    test_planner_agent_generates_daily_plan()
    print("planner_agent test passed")

