"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useLearningProgress } from "./learning_progress_provider";
import { CourseContextSelector } from "./course_context_selector";
import type { TodayTask } from "../student-api";
import type { TaskAvailability } from "../learning-progress";

type TaskEntryListProps = {
  section: string;
  title: string;
  description: string;
  subject?: string;
  emptyTitle: string;
  emptyDescription: string;
};

const availabilityText: Record<TaskAvailability, string> = {
  locked: "等待前序任务完成",
  available: "可以开始",
  in_progress: "继续完成",
  completed: "今天已完成",
};

/**
 * 练习、学科等入口共用真实任务列表，避免各页面再维护一份演示学习数据。
 */
export function TaskEntryList({
  section,
  title,
  description,
  subject,
  emptyTitle,
  emptyDescription,
}: TaskEntryListProps) {
  const router = useRouter();
  const {
    getAvailability,
    isReady,
    courseContextRequired,
    startTask,
    syncWarning,
    tasks,
  } = useLearningProgress();
  const [actionError, setActionError] = useState("");
  const visibleTasks = subject ? tasks.filter((task) => task.subject === subject) : tasks;

  async function openTask(task: TodayTask) {
    const availability = getAvailability(task.id);
    setActionError("");
    if (availability === "locked") return;

    if (availability === "available") {
      const started = await startTask(task.id);
      if (!started) {
        setActionError("服务端还没有确认任务开始。请恢复网络后重新尝试，避免把本机练习误记为已完成。");
        return;
      }
    }

    router.push(task.learningHref);
  }

  return (
    <section className="workbench-page-section" aria-labelledby="task-entry-list-title">
      <header className="section-page-heading">
        <div>
          <p>{section}</p>
          <h2 id="task-entry-list-title">{title}</h2>
          <span>{description}</span>
        </div>
      </header>

      {syncWarning ? <p className="daily-progress-storage-warning" role="alert">{syncWarning}</p> : null}
      {!isReady ? <p role="status">正在读取当前账号的学习任务…</p> : null}
      {isReady && courseContextRequired ? <CourseContextSelector required /> : null}
      {isReady && !courseContextRequired && !visibleTasks.length ? (
        <section className="workbench-inline-note task-entry-empty" aria-labelledby="task-entry-empty-title">
          <h3 id="task-entry-empty-title">{emptyTitle}</h3>
          <span>{emptyDescription}</span>
        </section>
      ) : null}
      {actionError ? <p className="daily-progress-storage-warning" role="alert">{actionError}</p> : null}

      {isReady && !courseContextRequired && visibleTasks.length ? (
        <div className="workspace-item-grid" aria-label="当前账号已分配任务">
          {visibleTasks.map((task) => {
            const availability = getAvailability(task.id);
            const isLocked = availability === "locked";
            return (
              <article className="workspace-item-card task-entry-card" key={task.id}>
                <span className={`item-tone tone-${task.subject === "数学" ? "blue" : task.subject === "英语" ? "mint" : "gold"}`} aria-hidden="true" />
                <div className="workspace-item-content">
                  <div className="workspace-item-meta">
                    <small>{task.subject} · 今日已分配</small>
                    <span>{availabilityText[availability]}</span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.objective}</p>
                  <div className="task-entry-footer">
                    <span>完成后 +{task.growthEarned} 成长值</span>
                    <button
                      className="workspace-card-action"
                      disabled={isLocked}
                      onClick={() => void openTask(task)}
                      type="button"
                    >
                      {availability === "completed" ? "查看任务" : availability === "in_progress" ? "继续完成" : isLocked ? "等待解锁" : "开始任务"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
