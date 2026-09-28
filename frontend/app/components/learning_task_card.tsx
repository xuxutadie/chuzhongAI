import type { TodayTask } from "../student-api";
import type { TaskAvailability } from "../learning-progress";

type LearningTaskCardProps = {
  task: TodayTask;
  taskNumber: number;
  availability: TaskAvailability;
  onOpen: (task: TodayTask) => void;
};

const statusText: Record<TaskAvailability, string> = {
  locked: "待解锁",
  available: "可以开始",
  in_progress: "继续完成",
  completed: "已完成"
};

export function LearningTaskCard({ task, taskNumber, availability, onOpen }: LearningTaskCardProps) {
  const isLocked = availability === "locked";
  const isCompleted = availability === "completed";

  return (
    <article className={`task-card task-card-${availability}`}>
      <div>
        <div className="task-card-labels">
          <span className="subject-chip">{task.subject}</span>
          <small>第 {taskNumber} 项</small>
        </div>
        <h3>{task.title}</h3>
        <p>{task.objective}</p>
      </div>
      <div className="task-meta">
        <span>完成后 +{task.growthEarned} 成长值</span>
        <strong>{statusText[availability]}</strong>
      </div>
      <div className="task-actions">
        {isCompleted ? (
          <span className="task-complete-label">完成记录已保存</span>
        ) : (
          <button type="button" disabled={isLocked} onClick={() => onOpen(task)}>
            {isLocked
              ? `完成第 ${taskNumber - 1} 项后解锁`
              : availability === "in_progress" ? "继续学习" : "开始这一项"}
          </button>
        )}
      </div>
    </article>
  );
}
