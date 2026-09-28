from agents.diagnosis_agent.service import DiagnosisAgent
from agents.test_data.mock_students import MOCK_STUDENTS


def test_diagnosis_agent_generates_report() -> None:
    result = DiagnosisAgent().run(MOCK_STUDENTS[0])
    assert result.agent_name == "diagnosis_agent"
    assert result.data["report_title"] == "学生学习诊断报告"
    assert "数学" in result.data["analysis"]
    assert result.data["recommendation"]


if __name__ == "__main__":
    test_diagnosis_agent_generates_report()
    print("diagnosis_agent test passed")

