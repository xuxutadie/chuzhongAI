from agents.coach_agent.test import test_coach_agent_generates_risk_reminder
from agents.diagnosis_agent.test import test_diagnosis_agent_generates_report
from agents.evaluation_agent.test import test_evaluation_agent_generates_weekly_report
from agents.planner_agent.test import test_planner_agent_generates_daily_plan
from agents.tutor_agent.test import test_tutor_agent_does_not_return_direct_answer


def main() -> None:
    test_diagnosis_agent_generates_report()
    test_planner_agent_generates_daily_plan()
    test_tutor_agent_does_not_return_direct_answer()
    test_evaluation_agent_generates_weekly_report()
    test_coach_agent_generates_risk_reminder()
    print("all agent tests passed")


if __name__ == "__main__":
    main()

