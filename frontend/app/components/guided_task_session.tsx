"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLearningProgress } from "./learning_progress_provider";
import {
  canCompleteGuidedTask,
  isActivityAnswerCorrect,
  sanitizeGuidedTaskAnswers,
  type GuidedTaskActivity
} from "../task-activity-data";
import {
  clearGuidedTaskDraft,
  type GuidedTaskDraft,
  loadGuidedTaskDraft,
  saveGuidedTaskDraft,
} from "../math-learning/storage";
import { getWorkspaceEntry } from "../student-api";

export function GuidedTaskSession({ activity }: { activity: GuidedTaskActivity }) {
  const {
    completeTask,
    getAvailability,
    isReady,
    startTask,
    syncWarning,
    isWorkspaceReady,
    workspaceState,
    workspaceWarning,
    storageNamespace,
    saveWorkspaceEntry,
    removeWorkspaceEntry,
  } = useLearningProgress();
  const [activeStep, setActiveStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [restoredDraftTaskId, setRestoredDraftTaskId] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [completionWarning, setCompletionWarning] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingTask, setIsStartingTask] = useState(false);
  const [taskStartWarning, setTaskStartWarning] = useState("");
  const startAttemptedTaskRef = useRef("");
  const availability = getAvailability(activity.taskId);

  const confirmTaskStart = useCallback(async () => {
    if (availability === "in_progress" || availability === "completed") return true;
    if (availability !== "available") {
      setTaskStartWarning("这项任务尚未解锁。请先完成今日路线中的前一项任务。");
      return false;
    }

    setIsStartingTask(true);
    setTaskStartWarning("");
    const started = await startTask(activity.taskId);
    setIsStartingTask(false);
    if (!started) {
      setTaskStartWarning("服务端未确认这项任务已经开始。请恢复网络后重试，避免把本机练习误记为今日完成记录。");
    }
    return started;
  }, [activity.taskId, availability, startTask]);

  useEffect(() => {
    if (!isWorkspaceReady || restoredDraftTaskId === activity.taskId) return;
    const serverDraft = getWorkspaceEntry<GuidedTaskDraft>(workspaceState, "guidedTaskDrafts", activity.taskId);
    const draft = serverDraft ?? loadGuidedTaskDraft(activity.taskId, undefined, storageNamespace);
    setActiveStep(draft?.activeStep ?? 0);
    setAnswers(sanitizeGuidedTaskAnswers(activity, draft?.answers ?? {}));
    setReflection(draft?.reflection ?? "");
    setIsCompleted(false);
    setStorageWarning(false);
    setCompletionWarning("");
    setRestoredDraftTaskId(activity.taskId);
  }, [activity.taskId, isWorkspaceReady, restoredDraftTaskId, storageNamespace, workspaceState]);

  useEffect(() => {
    if (restoredDraftTaskId !== activity.taskId || isCompleted) return;
    const draft = { activeStep, answers, reflection };
    if (!saveGuidedTaskDraft(activity.taskId, draft, undefined, storageNamespace)) {
      setStorageWarning(true);
    }
    void saveWorkspaceEntry("guidedTaskDrafts", activity.taskId, draft);
  }, [activeStep, activity.taskId, answers, isCompleted, reflection, restoredDraftTaskId, saveWorkspaceEntry, storageNamespace]);

  useEffect(() => {
    if (availability !== "available") {
      startAttemptedTaskRef.current = "";
      return;
    }
    if (!isReady || startAttemptedTaskRef.current === activity.taskId) return;
    startAttemptedTaskRef.current = activity.taskId;
    void confirmTaskStart();
  }, [activity.taskId, availability, confirmTaskStart, isReady]);

  useEffect(() => {
    if (availability === "completed") {
      setIsCompleted(true);
      if (!clearGuidedTaskDraft(activity.taskId, undefined, storageNamespace)) setStorageWarning(true);
      void removeWorkspaceEntry("guidedTaskDrafts", activity.taskId);
    }
  }, [activity.taskId, availability, removeWorkspaceEntry, storageNamespace]);

  const answeredCount = activity.questions.filter((question) => Boolean(answers[question.id])).length;
  const correctCount = useMemo(() => activity.questions.filter((question) =>
    isActivityAnswerCorrect(question, answers[question.id] ?? "")
  ).length, [activity.questions, answers]);
  const allQuestionsAnswered = activity.questions.every((question) => Boolean(answers[question.id]));
  const canFinish = canCompleteGuidedTask(activity, answers, reflection);

  if (!isReady) {
    return <section className="guided-task-loading">正在准备今天的学习内容……</section>;
  }

  if (availability === "locked") {
    return (
      <section className="guided-task-locked">
        <span>这项任务还没有解锁</span>
        <h2>请先完成前一项学习</h2>
        <p>系统会按照今天的路线一步一步带你完成，不需要跳着做。</p>
        <Link href="/tasks">返回今日路线</Link>
      </section>
    );
  }

  if (availability === "available") {
    return (
      <section className="guided-task-locked" aria-live="polite">
        <span>正在确认今日任务</span>
        <h2>确认后再开始本次学习</h2>
        <p>{taskStartWarning || "正在与学习服务确认本次任务，确认成功后才会记录到今日路线。"}</p>
        {syncWarning ? <p className="guided-storage-warning" role="alert">{syncWarning}</p> : null}
        {taskStartWarning ? (
          <button disabled={isStartingTask} onClick={() => void confirmTaskStart()} type="button">
            {isStartingTask ? "正在重新确认…" : "重新确认并开始"}
          </button>
        ) : null}
        <Link href="/tasks">返回今日路线</Link>
      </section>
    );
  }

  async function finishTask() {
    if (!canFinish) {
      return;
    }
    setIsSubmitting(true);
    const taskCompleted = await completeTask(activity.taskId, reflection, {
      kind: "guided_activity",
      answers,
    });
    if (!taskCompleted) {
      setCompletionWarning("暂时无法写入今日学习路线，请返回今日路线后重试。");
      setIsSubmitting(false);
      return;
    }

    if (!clearGuidedTaskDraft(activity.taskId, undefined, storageNamespace)) setStorageWarning(true);
    await removeWorkspaceEntry("guidedTaskDrafts", activity.taskId);
    setCompletionWarning("");
    setIsCompleted(true);
    setIsSubmitting(false);
  }

  return (
    <section className="guided-task" aria-labelledby="guided-task-title">
      <header className="guided-task-header">
        <div>
          <span>{activity.subject} · 今日任务</span>
          <h2 id="guided-task-title">{activity.title}</h2>
          <p>{activity.intro}</p>
        </div>
        <strong>第 {Math.min(activeStep + 1, 3)}/3 步</strong>
      </header>

      {storageWarning ? (
        <p className="guided-storage-warning" role="alert">
          当前浏览器无法保存草稿。你仍可继续学习，但请暂时不要关闭页面。
        </p>
      ) : null}
      {syncWarning ? <p className="guided-storage-warning" role="alert">{syncWarning}</p> : null}
      {workspaceWarning ? <p className="guided-storage-warning" role="alert">{workspaceWarning}</p> : null}
      {completionWarning ? (
        <p className="guided-storage-warning" role="alert">
          {completionWarning}
        </p>
      ) : null}

      <nav className="guided-step-nav" aria-label="学习步骤">
        {activity.steps.map((step, index) => (
          <button
            type="button"
            key={step}
            disabled={index > activeStep}
            aria-current={index === activeStep ? "step" : undefined}
            onClick={() => index < activeStep && setActiveStep(index)}
          >
            <span>{index < activeStep || isCompleted ? "完成" : index + 1}</span>
            <strong>{step}</strong>
          </button>
        ))}
      </nav>

      {activeStep === 0 ? (
        <section className="guided-stage guided-study-stage">
          <div className="guided-stage-heading"><span>先理解</span><h3>{activity.studyTitle}</h3></div>
          <div className="guided-reading">
            {activity.studyParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {activity.studyItems ? (
            <div className="word-study-grid">
              {activity.studyItems.map((item) => (
                <article key={item.term}>
                  <strong>{item.term}</strong><span>{item.meaning}</span><p>{item.example}</p>
                </article>
              ))}
            </div>
          ) : null}
          <button type="button" className="guided-primary-action" onClick={() => setActiveStep(1)}>
            我读懂了，进入自测
          </button>
        </section>
      ) : null}

      {activeStep === 1 ? (
        <section className="guided-stage">
          <div className="guided-stage-heading"><span>再验证</span><h3>回到刚才的内容找依据</h3></div>
          <div className="guided-question-list">
            {activity.questions.map((question, index) => {
              const selected = answers[question.id];
              const isCorrect = selected ? isActivityAnswerCorrect(question, selected) : false;
              return (
                <article className="guided-question" key={question.id}>
                  <h4>{index + 1}. {question.prompt}</h4>
                  <div className="guided-option-list">
                    {question.options.map((option) => (
                      <button
                        type="button"
                        key={option}
                        className={selected === option ? "is-selected" : ""}
                        aria-pressed={selected === option}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {selected ? (
                    <p className={isCorrect ? "answer-correct" : "answer-wrong"} role="status">
                      {isCorrect ? "回答正确。" : `再看一眼：正确答案是“${question.answer}”。`} {question.explanation}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="guided-stage-footer">
            <span>已回答 {answeredCount}/{activity.questions.length}，答对 {correctCount} 题</span>
            <button type="button" disabled={!allQuestionsAnswered} onClick={() => setActiveStep(2)}>
              完成自测，写下总结
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === 2 ? (
        <section className="guided-stage">
          <div className="guided-stage-heading"><span>最后表达</span><h3>用自己的话说出来</h3></div>
          <label className="guided-reflection">
            {activity.reflectionPrompt}
            <textarea
              rows={5}
              value={reflection}
              placeholder={activity.reflectionPlaceholder}
              onChange={(event) => setReflection(event.target.value)}
            />
          </label>
          <div className="guided-stage-footer">
            <span>
              至少答对 {activity.minimumCorrectCount}/{activity.questions.length} 题，并写 {activity.reflectionMinLength} 个字。
              当前答对 {correctCount} 题，已写 {reflection.trim().length} 个字。
            </span>
            <button type="button" disabled={!canFinish || isCompleted || isSubmitting} onClick={finishTask}>
              {isCompleted ? "学习记录已保存" : isSubmitting ? "正在提交并核验…" : "完成并保存记录"}
            </button>
          </div>
          {isCompleted ? (
            <div className="guided-complete-message" role="status">
              <div><span>这一项完成了</span><strong>成长值 +40，下一项已经解锁</strong></div>
              <Link href="/tasks">回到今日路线，继续下一项</Link>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
