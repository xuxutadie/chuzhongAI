"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useLearningProgress } from "./learning_progress_provider";
import {
  isCompletionFromLocalDate,
  isLessonCompletionMessage
} from "../interactive-lesson-message";
import {
  clearInteractiveLessonDraft,
  loadInteractiveLessonDraft,
  saveInteractiveLessonDraft,
} from "../math-learning/storage";
import type { InteractiveLesson } from "../interactive-lessons/lesson-catalog";
import {
  getInteractiveFallbackMessage,
  parseInteractiveLessonProgress,
  type InteractiveLessonProgress,
} from "../interactive-lesson-recovery";
import { observeIframeAutoHeight } from "../interactive-lessons/iframe-auto-height.mjs";
import { getWorkspaceEntry } from "../student-api";

const progressStorageKey = "interactive-lesson-progress-v1";

type StoredProgress = InteractiveLessonProgress;

function readProgress(namespace: string) {
  try {
    return parseInteractiveLessonProgress(window.localStorage.getItem(`${progressStorageKey}:${namespace}`));
  } catch {
    return {};
  }
}

function saveProgress(progress: StoredProgress, namespace: string) {
  try {
    window.localStorage.setItem(`${progressStorageKey}:${namespace}`, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function InteractiveLessonPlayer({ lesson }: { lesson: InteractiveLesson }) {
  const {
    tasks,
    isWorkspaceReady,
    workspaceState,
    workspaceWarning,
    storageNamespace,
    saveWorkspaceEntry,
    removeWorkspaceEntry,
  } = useLearningProgress();
  const [reflection, setReflection] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasCompletedInteractive, setHasCompletedInteractive] = useState(false);
  const [restoredDraftLessonId, setRestoredDraftLessonId] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const [completionWarning, setCompletionWarning] = useState("");
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameStatus, setFrameStatus] = useState<"loading" | "loaded" | "fallback">(
    lesson.localPath ? "loading" : "fallback",
  );
  const linkedTask = tasks.find((task) => task.learningHref.includes(lesson.id));
  const completionSummary = linkedTask
    ? "这节课已留下独立学习记录；今日任务仍需在任务页完成答案核验。"
    : "独立学习内容已保存，不会影响今天的三项任务。";

  useEffect(() => {
    if (!isWorkspaceReady || restoredDraftLessonId === lesson.id) return;
    const serverProgress = getWorkspaceEntry<StoredProgress>(workspaceState, "interactiveLessonProgress", "items") ?? {};
    const existing = serverProgress[lesson.id] ?? readProgress(storageNamespace)[lesson.id];
    if (existing && isCompletionFromLocalDate(existing.completedAt)) {
      setReflection(existing.note);
      setIsCompleted(true);
      setHasCompletedInteractive(true);
    } else {
      const serverDraft = getWorkspaceEntry<{ reflection: string; hasCompletedInteractive: boolean }>(
        workspaceState,
        "interactiveLessonDrafts",
        lesson.id,
      );
      const draft = serverDraft ?? loadInteractiveLessonDraft(lesson.id, undefined, storageNamespace);
      setReflection(draft?.reflection ?? "");
      setIsCompleted(false);
      setHasCompletedInteractive(draft?.hasCompletedInteractive ?? false);
    }
    setStorageWarning(false);
    setCompletionWarning("");
    setRestoredDraftLessonId(lesson.id);
  }, [isWorkspaceReady, lesson.id, restoredDraftLessonId, storageNamespace, workspaceState]);

  useEffect(() => {
    if (restoredDraftLessonId !== lesson.id || isCompleted) return;
    const draft = { reflection, hasCompletedInteractive };
    if (!saveInteractiveLessonDraft(lesson.id, draft, undefined, storageNamespace)) {
      setStorageWarning(true);
    }
    void saveWorkspaceEntry("interactiveLessonDrafts", lesson.id, draft);
  }, [hasCompletedInteractive, isCompleted, lesson.id, reflection, restoredDraftLessonId, saveWorkspaceEntry, storageNamespace]);

  useEffect(() => {
    function handleLessonMessage(event: MessageEvent) {
      if (isLessonCompletionMessage(event.origin, window.location.origin, event.data, lesson.id)) {
        setHasCompletedInteractive(true);
      }
    }

    window.addEventListener("message", handleLessonMessage);
    return () => window.removeEventListener("message", handleLessonMessage);
  }, [lesson.id]);

  useEffect(() => {
    if (!lesson.localPath) {
      setFrameStatus("fallback");
      return;
    }
    setFrameStatus("loading");
    const timeoutId = window.setTimeout(() => setFrameStatus((current) => current === "loading" ? "fallback" : current), 10_000);
    return () => window.clearTimeout(timeoutId);
  }, [lesson.id, lesson.localPath]);

  useEffect(() => {
    setFrameHeight(null);
    const frame = frameRef.current;
    if (!lesson.localPath || !frame) return;

    return observeIframeAutoHeight(frame, (height) => {
      setFrameHeight((currentHeight) => (
        currentHeight !== null && Math.abs(currentHeight - height) <= 1
          ? currentHeight
          : height
      ));
    });
  }, [lesson.id, lesson.localPath]);

  async function completeLesson() {
    if (!hasCompletedInteractive || reflection.trim().length < 8) {
      return;
    }

    if (linkedTask) {
      setCompletionWarning("这节互动课目前是独立学习内容，不能替代今日任务的答案核验。请从“今天要做”完成对应任务。");
      return;
    }

    const progress = {
      ...(getWorkspaceEntry<StoredProgress>(workspaceState, "interactiveLessonProgress", "items") ?? {}),
      ...readProgress(storageNamespace),
    };
    progress[lesson.id] = {
      completedAt: new Date().toISOString(),
      note: reflection.trim()
    };
    const accountSaved = await saveWorkspaceEntry("interactiveLessonProgress", "items", progress);
    if (!accountSaved) {
      if (!saveInteractiveLessonDraft(
        lesson.id,
        { reflection, hasCompletedInteractive },
        undefined,
        storageNamespace,
      )) {
        setStorageWarning(true);
      }
      setCompletionWarning("账号记录还未保存，当前仅保留在本机草稿中。恢复网络后请再次点击“完成并记录”。");
      return;
    }

    if (!saveProgress(progress, storageNamespace)) {
      setStorageWarning(true);
    } else if (!clearInteractiveLessonDraft(lesson.id, undefined, storageNamespace)) {
      setStorageWarning(true);
    }
    if (!await removeWorkspaceEntry("interactiveLessonDrafts", lesson.id)) {
      setStorageWarning(true);
    }
    setCompletionWarning("");
    setIsCompleted(true);
  }

  function enableTextFallback() {
    setHasCompletedInteractive(true);
    setCompletionWarning("已启用文字替代学习。请完成下方反思后保存本次学习记录。");
  }

  return (
    <div className="interactive-player">
      <section className="interactive-player-intro">
        <div>
          <p>{lesson.chapter} · {lesson.source}</p>
          <h2>{lesson.title}</h2>
          <span>{lesson.description}</span>
        </div>
        <Link className="interactive-back-link" href="/interactive-lessons">返回互动教学</Link>
      </section>

      {lesson.localPath ? (
        <section className="interactive-frame-section" aria-label={`${lesson.title}互动课件`}>
          <iframe
            className="interactive-frame"
            ref={frameRef}
            onError={() => setFrameStatus("fallback")}
            onLoad={() => setFrameStatus("loaded")}
            src={lesson.localPath}
            style={frameHeight === null ? undefined : { height: `${frameHeight}px` }}
            title={lesson.title}
            allow="fullscreen"
          />
          {frameStatus === "loaded" ? (
            <button className="interactive-frame-fallback-link" onClick={() => setFrameStatus("fallback")} type="button">
              课件显示异常？改用文字学习
            </button>
          ) : null}
        </section>
      ) : null}
      {frameStatus === "fallback" ? (
        <section className="interactive-frame-fallback" role="alert" aria-labelledby="interactive-fallback-title">
          <p>文字替代学习</p>
          <h3 id="interactive-fallback-title">互动课件暂时不可用</h3>
          <span>{getInteractiveFallbackMessage(lesson.title)}</span>
          <ol>
            <li>阅读本页“学习反馈”中的问题。</li>
            <li>用自己的话写下规律或操作思路。</li>
            <li>确认后继续完成本次独立学习记录。</li>
          </ol>
          <button className="interactive-primary-action" onClick={enableTextFallback} type="button">
            我已完成文字自检
          </button>
        </section>
      ) : null}

      <section className="interactive-checkpoint" aria-labelledby="interactive-checkpoint-title">
        <div className="section-heading">
          <p>学习反馈</p>
          <h2 id="interactive-checkpoint-title">把你观察到的规律写下来</h2>
        </div>
        {storageWarning ? (
          <p className="interactive-storage-warning" role="alert">
            当前浏览器无法保存草稿。你仍可继续学习，但请暂时不要关闭页面。
          </p>
        ) : null}
        {completionWarning ? (
          <p className="interactive-storage-warning" role="alert">
            {completionWarning}
          </p>
        ) : null}
        {workspaceWarning ? <p className="interactive-storage-warning" role="alert">{workspaceWarning}</p> : null}
        <label htmlFor="lesson-reflection">{lesson.studyPrompt}</label>
        <textarea
          id="lesson-reflection"
          value={reflection}
          onChange={(event) => setReflection(event.target.value)}
          placeholder="至少写一句你的发现，例如：当……时，……会……"
          rows={4}
        />
        <div className="interactive-checkpoint-actions">
          <span className={hasCompletedInteractive ? "checkpoint-ready" : "checkpoint-waiting"}>
            {hasCompletedInteractive
              ? frameStatus === "fallback"
                ? "文字替代自检已确认。再写一句你的发现，就能完成这一项。"
                : "互动自检已通过。再写一句你的发现，就能完成这一项。"
              : "请先完成上方课件里的操作、观察和即时自检。通过后这里会自动开放。"}
          </span>
          <button
            type="button"
            className="interactive-primary-action"
            disabled={isCompleted || !hasCompletedInteractive || reflection.trim().length < 8}
            onClick={completeLesson}
          >
            {isCompleted ? "已记录学习完成" : "完成并记录"}
          </button>
        </div>
        {isCompleted ? (
          <div className="interactive-success" role="status">
            <span>已保存学习记录，{completionSummary}</span>
            <Link href={linkedTask ? "/tasks" : "/interactive-lessons"}>
              {linkedTask ? "回到今日路线，继续下一项" : "回到互动教学，继续自主探索"}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
