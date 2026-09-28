"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

import { useLearningProgress } from "./learning_progress_provider";
import { CourseContextSelector } from "./course_context_selector";

export function StudentDashboard() {
  const router = useRouter();
  const [actionError, setActionError] = useState("");
  const {
    completedCount,
    completionRate,
    courseContextRequired,
    currentTaskId,
    getAvailability,
    isReady,
    progress,
    startTask,
    syncWarning,
    tasks,
  } = useLearningProgress();
  const currentTask = tasks.find((task) => task.id === currentTaskId) ?? null;

  async function openCurrentTask() {
    setActionError("");
    if (!currentTask) {
      router.push("/reports");
      return;
    }

    const availability = getAvailability(currentTask.id);
    if (availability === "locked") {
      setActionError("当前任务尚未解锁，请先完成前一项学习。");
      return;
    }
    if (availability === "available") {
      const started = await startTask(currentTask.id);
      if (!started) {
        setActionError("服务端还没有确认任务开始，请检查网络后重试，避免把本机练习误记为已完成。");
        return;
      }
    }
    router.push(currentTask.learningHref);
  }

  if (!isReady) {
    return <section className="workbench-dashboard" role="status">正在恢复今天的学习路线…</section>;
  }

  if (!tasks.length) {
    return (
      <section className="workbench-dashboard empty-dashboard-state" aria-labelledby="dashboard-title">
        <p>今日学习路线</p>
        <h2 id="dashboard-title">{courseContextRequired ? "先选择今天的课程内容" : "暂时没有可显示的任务"}</h2>
        <span>{courseContextRequired
          ? "选择已导入的教材、章节和知识点后，系统才会生成可记录的今日学习路线。"
          : syncWarning || "请稍后刷新；系统不会用演示任务替代你的真实学习记录。"}</span>
        {courseContextRequired ? <CourseContextSelector required /> : null}
      </section>
    );
  }

  return (
    <section className="workbench-dashboard" id="home">
      {syncWarning ? <p className="daily-progress-storage-warning" role="alert">{syncWarning}</p> : null}
      {actionError ? <p className="daily-progress-storage-warning" role="alert">{actionError}</p> : null}
      <section className="daily-focus-card" aria-labelledby="dashboard-title">
        <div className="daily-focus-copy">
          <p>{currentTask ? "今天从当前任务开始" : "今日学习已经完成"}</p>
          <h2 id="dashboard-title">
            {currentTask ? `下一步：${currentTask.title}` : "今天的学习路线已经完成"}
          </h2>
          <span>{currentTask
            ? currentTask.objective
            : "完成记录已保存到你的账号，可以查看今天的学习总结。"}</span>
          <button type="button" className="dashboard-main-action" onClick={() => void openCurrentTask()}>
            {currentTask ? <>开始：{currentTask.title}</> : "查看今日总结"}
          </button>
        </div>
        <div className="daily-focus-progress">
          <div
            className="progress-dial"
            style={{ "--progress": `${completionRate * 3.6}deg` } as CSSProperties}
          >
            <strong>{completedCount}/{tasks.length}</strong>
            <span>今日完成</span>
          </div>
          <small>今日已获得 {progress.growthEarned} 成长值</small>
        </div>
      </section>

      <section className="today-route" aria-label="今天的学习路线">
        {tasks.map((task, index) => {
          const availability = getAvailability(task.id);
          return (
            <div className={`route-step route-step-${availability}`} key={task.id}>
              <span>{availability === "completed" ? "完成" : index + 1}</span>
              <div><strong>{task.subject}</strong><small>{task.title}</small></div>
            </div>
          );
        })}
      </section>

      <div className="dashboard-stat-grid dashboard-stat-grid-compact">
        <article><span>今日任务</span><strong>{completedCount}/{tasks.length}</strong><small>按顺序完成才能解锁下一项</small></article>
        <article><span>今日成长值</span><strong>+{progress.growthEarned}</strong><small>仅在服务端核验完成后计入</small></article>
        <article><span>当前状态</span><strong>{currentTask ? "学习中" : "已完成"}</strong><small>{currentTask ? currentTask.subject : "可以查看报告"}</small></article>
      </div>

      <div className="dashboard-content-grid dashboard-content-grid-simple">
        <section className="workbench-panel panel-ai" aria-labelledby="ai-title">
          <div className="panel-heading">
            <div>
              <span>学习提醒</span>
              <h3 id="ai-title">一次只完成当前这一项</h3>
            </div>
          </div>
          <p>{currentTask
            ? `当前重点：${currentTask.objective}`
            : "今天的任务已完成。你可以整理一条错题或回看学习报告。"}</p>
          <Link className="panel-action-link" href="/assistant">有问题就问 AI 老师</Link>
        </section>

        <section className="workbench-panel panel-mistakes" aria-labelledby="mistakes-title">
          <div className="panel-heading">
            <div>
              <span>错题复习</span>
              <h3 id="mistakes-title">我的错题记录</h3>
            </div>
            <Link href="/wrong-questions">进入错题集</Link>
          </div>
          <p>只会显示保存到当前账号的错题；还没有记录时不会展示演示题目。</p>
        </section>

        <section className="workbench-panel panel-growth panel-growth-wide" aria-labelledby="growth-title">
          <div className="panel-heading">
            <div>
              <span>今日完成情况</span>
              <h3 id="growth-title">我的学习节奏</h3>
            </div>
            <Link href="/reports">查看学习报告</Link>
          </div>
          <p>今天已完成 {completedCount} 项任务。完成记录来自当前账号，不会混入其他同学的数据。</p>
        </section>
      </div>
    </section>
  );
}
