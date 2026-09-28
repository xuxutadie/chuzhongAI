from typing import Protocol


class LearningNotFoundError(Exception):
    """学习任务不存在或不属于当前学生。"""


class LearningConflictError(Exception):
    """学习任务当前状态不允许执行请求。"""


class LearningRepository(Protocol):
    """学习任务持久化边界，由 PostgreSQL 仓储实现。"""

    def get_task(self, student_id: str, task_id: str) -> dict[str, object] | None:
        """查询属于学生的学习任务。"""

    def get_completed_result(self, task_id: str) -> dict[str, object] | None:
        """查询已完成任务的闭环结果。"""

    def start_task(self, task: dict[str, object]) -> dict[str, object]:
        """开始任务并创建学习记录。"""

    def complete_task(
        self,
        task: dict[str, object],
        duration_minutes: int,
        mastery_level: int,
        student_feedback: str | None,
        growth_delta: int,
    ) -> dict[str, object]:
        """在一个事务内完成任务、学习记录与成长记录。"""

    def list_study_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        """按时间倒序查询学习记录。"""

    def list_growth_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        """按时间倒序查询成长值流水。"""


class LearningService:
    """封装学习任务闭环的状态规则。"""

    task_completion_growth = 10

    def __init__(self, repository: LearningRepository) -> None:
        self.repository = repository

    def start_task(self, student_id: str, task_id: str) -> dict[str, object]:
        task = self._get_actionable_task(student_id, task_id)
        if task["status"] == "completed":
            raise LearningConflictError("已完成任务不能再次开始")
        return self.repository.start_task(task)

    def complete_task(
        self,
        student_id: str,
        task_id: str,
        duration_minutes: int,
        mastery_level: int,
        student_feedback: str | None,
    ) -> dict[str, object]:
        task = self._get_actionable_task(student_id, task_id)
        completed_result = self.repository.get_completed_result(task_id)
        if completed_result is not None:
            return completed_result
        if task["status"] not in {"pending", "in_progress"}:
            raise LearningConflictError("当前任务状态不能标记完成")
        return self.repository.complete_task(
            task=task,
            duration_minutes=duration_minutes,
            mastery_level=mastery_level,
            student_feedback=student_feedback,
            growth_delta=self.task_completion_growth,
        )

    def get_study_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        return self.repository.list_study_records(student_id, limit)

    def get_growth_records(self, student_id: str, limit: int) -> list[dict[str, object]]:
        return self.repository.list_growth_records(student_id, limit)

    def _get_actionable_task(self, student_id: str, task_id: str) -> dict[str, object]:
        task = self.repository.get_task(student_id, task_id)
        if task is None:
            raise LearningNotFoundError("学习任务不存在或不属于当前学生")
        if task["status"] == "cancelled":
            raise LearningConflictError("已取消任务不能执行")
        return task
