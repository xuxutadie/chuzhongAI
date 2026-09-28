"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { isMathInteractionResultMessage } from "../interactive-lesson-message";
import { observeIframeAutoHeight } from "../interactive-lessons/iframe-auto-height.mjs";
import { createVisualPresentation } from "../math-learning/visual-presentation.js";
import type {
  InteractionResultMessage,
  MathQuestion,
} from "../math-learning/types";

type MathInteractionQuestionProps = {
  question: MathQuestion;
  unavailableLabel?: string;
  onPassed?: (result: InteractionResultMessage) => void;
  onUnavailable?: () => void;
};

export function MathInteractionQuestion({
  question,
  unavailableLabel = "更换备用题",
  onPassed,
  onUnavailable,
}: MathInteractionQuestionProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "timeout" | "error">("loading");
  const [frameHeight, setFrameHeight] = useState<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const expectedChallengeId =
    typeof question.correctAnswer === "object" && !Array.isArray(question.correctAnswer)
      ? question.correctAnswer.challengeId
      : question.id;
  const presentation = createVisualPresentation(question);
  const isPreview = presentation?.mode === "preview";
  const source = useMemo(() => {
    if (!presentation) return "";
    const params = new URLSearchParams({
      section: presentation.section,
      difficulty: question.difficulty,
      mode: presentation.mode,
      embedded: "question",
      reload: String(reloadKey),
    });
    if (presentation.mode === "challenge") params.set("challenge", expectedChallengeId);
    if (presentation.solid) params.set("solid", presentation.solid);
    if (presentation.planePreset) params.set("planePreset", presentation.planePreset);
    if (presentation.netId) params.set("netId", presentation.netId);
    if (presentation.structureId) params.set("structureId", presentation.structureId);
    if (presentation.view) params.set("view", presentation.view);
    return `/interactive-lessons/sims/chapter1-shapes-world.html?${params.toString()}`;
  }, [expectedChallengeId, presentation, question.difficulty, reloadKey]);

  useEffect(() => {
    setLoadState("loading");
    setFrameHeight(null);
    timeoutRef.current = setTimeout(() => setLoadState("timeout"), 9000);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [source]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!source || !frame) return;

    return observeIframeAutoHeight(frame, (height) => {
      setFrameHeight((currentHeight) => (
        currentHeight !== null && Math.abs(currentHeight - height) <= 1
          ? currentHeight
          : height
      ));
    });
  }, [source]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const runtimeError = event.data as Record<string, unknown> | null;
      if (
        runtimeError?.type === "math-interaction-runtime-error" &&
        runtimeError.lessonId === "g7-upper-shapes" &&
        runtimeError.knowledgePointId === question.knowledgePointId &&
        runtimeError.challengeId === expectedChallengeId
      ) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setLoadState("error");
        return;
      }

      if (isPreview) return;
      if (
        !isMathInteractionResultMessage(
          event.origin,
          window.location.origin,
          event.data,
          question.knowledgePointId,
        )
      ) {
        return;
      }

      const result = event.data as InteractionResultMessage;
      if (result.challengeId === expectedChallengeId && result.passed) {
        onPassed?.(result);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [expectedChallengeId, isPreview, onPassed, question.knowledgePointId]);

  function handleLoad() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoadState((current) => current === "loading" ? "ready" : current);
  }

  function handleError() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLoadState("error");
  }

  function reload() {
    setReloadKey((value) => value + 1);
  }

  if (!presentation) {
    return (
      <div className="math-visual-recovery" role="alert">
        <strong>这道题的图形暂时不可用</strong>
        <span>题目不会被跳过，请改用文字替代题后继续作答。</span>
        {onUnavailable ? <button type="button" onClick={onUnavailable}>{unavailableLabel}</button> : null}
      </div>
    );
  }

  return (
    <div className={`math-interaction-frame math-interaction-${loadState}`}>
      <iframe
        key={source}
        ref={iframeRef}
        src={source}
        title={`${question.prompt}互动图形`}
        onError={handleError}
        onLoad={handleLoad}
        style={frameHeight === null ? undefined : { height: `${frameHeight}px` }}
        allow="fullscreen"
      />
      {loadState === "loading" ? <p className="math-visual-status">正在准备互动图形...</p> : null}
      {loadState === "timeout" || loadState === "error" ? (
        <div className="math-visual-recovery" role="alert">
          <strong>{loadState === "error" ? "图形运行时出现问题" : "图形暂时没有加载出来"}</strong>
          <span>题目不会被跳过，可以重新加载或改用文字替代题。</span>
          <div>
            <button type="button" onClick={reload}>重新加载图形</button>
            {onUnavailable ? <button type="button" onClick={onUnavailable}>{unavailableLabel}</button> : null}
          </div>
        </div>
      ) : null}
      {!isPreview && loadState === "ready" ? (
        <p className="math-interaction-hint">请在图形中完成操作和即时挑战，成功后再进入下一题。</p>
      ) : null}
    </div>
  );
}
