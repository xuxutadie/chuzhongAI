"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { MathInteractionQuestion } from "./math_interaction_question";
import { MathQuestionRenderer } from "./math_question_renderer";
import { MathTextStudy } from "./math_text_study";
import { CourseContextSelector } from "./course_context_selector";
import { useLearningProgress } from "./learning_progress_provider";
import { getMathKnowledgePackage } from "../math-learning/knowledge-registry";
import { getReviewQuestions, getRoundQuestions } from "../math-learning/targeted-study";
import {
  advanceAfterDiagnosis,
  completeTargetedLearning,
  createTextFallbackQuestion,
  createSession,
  getCurrentKnowledgePointId,
  isQuestionAnswerCorrect,
  recordAnswer,
  scoreRound,
} from "../math-learning/session-engine";
import { clearSession, loadSession, saveSession } from "../math-learning/storage";
import { buildMathCompletionAttempts } from "../student-learning-evidence";
import { getWorkspaceEntry } from "../student-api";
import { DAILY_MATH_TASK_ID } from "../student-data";
import type {
  InteractionResultMessage,
  MathDiagnosis,
  MathLearningSession,
  MathQuestion,
  QuestionAttempt,
} from "../math-learning/types";

const STUDENT_FLOW_STEPS = ["选择内容", "首次测试", "查看诊断", "针对学习", "过关测试"] as const;

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function phaseStep(session: MathLearningSession | null) {
  if (!session) return 0;
  if (session.phase === "diagnostic") return 1;
  if (session.phase === "diagnosis") return 2;
  if (session.phase === "learning" || session.phase === "needs-help") return 3;
  return 4;
}

export function MathLearningWorkspace() {
  const {
    completeTask,
    courseContextRequired,
    getAvailability,
    isReady,
    startTask,
    isWorkspaceReady,
    workspaceState,
    workspaceWarning,
    storageNamespace,
    tasks,
    saveWorkspaceEntry,
    removeWorkspaceEntry,
  } = useLearningProgress();
  const localDate = useMemo(todayKey, []);
  // 任务 ID 是服务端可信流程的稳定标识；路由文案可调整，但不能据此误认数学任务。
  const mathTask = tasks.find((task) => task.id === DAILY_MATH_TASK_ID) ?? null;
  const mathTaskId = mathTask?.id ?? null;
  const taskCourseContext = mathTask?.courseContext ?? null;
  const isLegacyMathTask = Boolean(mathTask && !taskCourseContext);
  const taskContextKey = taskCourseContext
    ? `${mathTaskId}:${taskCourseContext.courseId}:${taskCourseContext.chapterId}:${taskCourseContext.knowledgePoints.map((point) => point.id).join(",")}`
    : `${mathTaskId ?? "none"}:legacy`;
  const allowedKnowledgePointIds = useMemo(
    () => new Set(taskCourseContext?.knowledgePoints.map((point) => point.id) ?? []),
    [taskCourseContext],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [session, setSession] = useState<MathLearningSession | null>(null);
  const [draftAnswer, setDraftAnswer] = useState<QuestionAttempt["answer"] | null>(null);
  const [diagnosis, setDiagnosis] = useState<MathDiagnosis | null>(null);
  const [targetedLearningDone, setTargetedLearningDone] = useState(false);
  const [targetedFallback, setTargetedFallback] = useState(false);
  const [preparingRetest, setPreparingRetest] = useState(false);
  const [restored, setRestored] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [completionWarning, setCompletionWarning] = useState("");
  const [completionRetry, setCompletionRetry] = useState(0);
  const [taskStartWarning, setTaskStartWarning] = useState("");
  const [isStartingTask, setIsStartingTask] = useState(false);
  const completionRequestedRef = useRef(false);
  const automaticStartAttemptedRef = useRef(false);
  const restoredContextKeyRef = useRef("");
  const mathTaskAvailability = mathTaskId ? getAvailability(mathTaskId) : "locked";

  const confirmMathTaskStart = useCallback(async () => {
    if (!mathTaskId) {
      setTaskStartWarning("还没有生成可记录的数学任务。请先确认今天的课程内容。");
      return false;
    }
    if (mathTaskAvailability === "in_progress") return true;
    if (mathTaskAvailability === "completed") {
      setTaskStartWarning("今天的数学任务已经完成。请回到今日路线查看已保存的记录。");
      return false;
    }
    if (mathTaskAvailability !== "available") {
      setTaskStartWarning("这项数学任务尚未解锁。请先完成今日路线中的前一项任务。");
      return false;
    }

    setIsStartingTask(true);
    setTaskStartWarning("");
    const started = await startTask(mathTaskId);
    setIsStartingTask(false);
    if (!started) {
      setTaskStartWarning("服务端未确认这项诊断已经开始。请恢复网络后重试，避免把本机练习误记为今日完成记录。");
    }
    return started;
  }, [mathTaskAvailability, mathTaskId, startTask]);

  useEffect(() => {
    // 课程保存后，尚未开始的今日任务会获得新的冻结快照；旧草稿不能跨课程继续使用。
    if (restoredContextKeyRef.current === taskContextKey) return;
    restoredContextKeyRef.current = taskContextKey;
    setRestored(false);
    setSession(null);
    setDiagnosis(null);
    setSelectedIds([]);
    setTaskStartWarning("");
    automaticStartAttemptedRef.current = false;
    completionRequestedRef.current = false;
  }, [taskContextKey]);

  useEffect(() => {
    if (!isWorkspaceReady || !isReady || restored || courseContextRequired) return;
    const serverSession = getWorkspaceEntry<MathLearningSession>(workspaceState, "mathSessions", localDate);
    const saved = serverSession ?? loadSession(localDate, undefined, storageNamespace);
    const matchesTaskContext = !taskCourseContext
      || saved?.selectedKnowledgePointIds.every((id) => allowedKnowledgePointIds.has(id));
    if (saved && matchesTaskContext && saved.selectedKnowledgePointIds.every((id) => getMathKnowledgePackage(id))) {
      setSession(saved);
      setSelectedIds(saved.selectedKnowledgePointIds);
      if (saved.phase === "diagnosis") setDiagnosis(scoreRound(saved));
    }
    setRestored(true);
  }, [allowedKnowledgePointIds, courseContextRequired, isReady, isWorkspaceReady, localDate, restored, storageNamespace, taskCourseContext, workspaceState]);

  useEffect(() => {
    if (!restored || !session) return;
    if (!saveSession(session, undefined, storageNamespace)) {
      setStorageWarning(true);
    }
    void saveWorkspaceEntry("mathSessions", localDate, session);
  }, [localDate, restored, saveWorkspaceEntry, session, storageNamespace]);

  useEffect(() => {
    // 旧草稿恢复后也必须重新获得服务端确认，避免离线草稿被误呈为已开始的今日任务。
    if (
      !isReady
      || !session
      || mathTaskAvailability !== "available"
      || automaticStartAttemptedRef.current
    ) {
      return;
    }
    automaticStartAttemptedRef.current = true;
    void confirmMathTaskStart();
  }, [confirmMathTaskStart, isReady, mathTaskAvailability, session]);

  useEffect(() => {
    if (!isReady || session?.phase !== "passed") {
      completionRequestedRef.current = false;
      return;
    }

    if (mathTaskAvailability === "available") {
      setCompletionWarning("服务端尚未确认这份诊断已开始，暂时不能记入今日学习记录。");
      return;
    }

    if (mathTaskAvailability === "in_progress" && !completionRequestedRef.current) {
      if (!mathTaskId) {
        setCompletionWarning("今天的数学任务尚未生成，无法提交完成记录。");
        return;
      }
      const attempts = buildMathCompletionAttempts(session);
      if (!attempts.length) {
        setCompletionWarning("这次诊断缺少可核验的作答，请重新完成本轮测试后再提交。");
        return;
      }
      completionRequestedRef.current = true;
      setCompletionWarning("");
      void completeTask(
        mathTaskId,
        `已完成${taskCourseContext?.chapterTitle ?? "数学"}课堂诊断，所选知识点均已过关。`,
        { kind: "math_diagnosis", attempts },
      ).then((completed) => {
        if (!completed) {
          setCompletionWarning("服务端暂未确认本次诊断。请恢复网络后点击“重新保存学习结果”，不需要重做题目。");
          completionRequestedRef.current = false;
        } else {
          setCompletionWarning("");
        }
      });
    }
  }, [completeTask, completionRetry, isReady, mathTaskAvailability, mathTaskId, session, taskCourseContext?.chapterTitle]);

  const currentKnowledgePointId = session ? getCurrentKnowledgePointId(session) : null;
  const currentPack = currentKnowledgePointId ? getMathKnowledgePackage(currentKnowledgePointId) : null;
  const roundQuestionKey = session && currentKnowledgePointId
    ? `${currentKnowledgePointId}:round-${session.round}`
    : null;
  const activeQuestions = currentPack
    ? roundQuestionKey
      ? session?.roundQuestions[roundQuestionKey] ?? getRoundQuestions(currentPack, session?.round ?? 1)
      : currentPack.questions
    : [];
  const currentAttempts = useMemo(() => {
    if (!session || !currentKnowledgePointId) return [];
    return session.answers.filter(
      (attempt) =>
        attempt.knowledgePointId === currentKnowledgePointId && attempt.round === session.round,
    );
  }, [currentKnowledgePointId, session]);
  const answeredIds = useMemo(
    () => new Set(currentAttempts.map((attempt) => attempt.questionId)),
    [currentAttempts],
  );
  const currentQuestion = activeQuestions.find((question) => !answeredIds.has(question.id)) ?? null;
  const latestWeakTags = diagnosis?.weakTags ?? session?.scores.at(-1)?.weakTags ?? [];
  useEffect(() => {
    if (
      !session ||
      session.phase !== "retest" ||
      !currentPack ||
      !roundQuestionKey ||
      session.roundQuestions[roundQuestionKey]
    ) {
      return;
    }

    const retestQuestionKey = roundQuestionKey;
    setPreparingRetest(true);
    const baseQuestions = getRoundQuestions(currentPack, session.round);

    function saveRetestQuestions(questions: MathQuestion[]) {
      setSession((current) => current ? {
        ...current,
        roundQuestions: { ...current.roundQuestions, [retestQuestionKey]: questions },
      } : current);
    }

    // 当前未配置安全、可核验的服务端变式题登记时，只使用已审核题库重测。
    // 这样不会把无法由后端判分的 ai-* 题号混入今日任务完成凭据。
    saveRetestQuestions(baseQuestions);
    setPreparingRetest(false);
  }, [currentPack, roundQuestionKey, session]);

  useEffect(() => {
    setDraftAnswer(null);
  }, [currentQuestion?.id, session?.round]);

  useEffect(() => {
    if (!taskCourseContext) return;
    // 当前任务的课程快照是唯一允许的知识点集合，不能从旧草稿或前端目录越界带入。
    setSelectedIds((current) => current.filter((id) => allowedKnowledgePointIds.has(id)));
  }, [allowedKnowledgePointIds, taskCourseContext]);

  function toggleKnowledgePoint(id: string) {
    if (!allowedKnowledgePointIds.has(id)) return;
    setSelectedIds((items) =>
      items.includes(id) ? items.filter((item) => item !== id) : [...items, id],
    );
  }

  async function startLearning() {
    if (
      !taskCourseContext
      || !selectedIds.length
      || selectedIds.some((id) => !allowedKnowledgePointIds.has(id))
      || isStartingTask
    ) return;
    const started = await confirmMathTaskStart();
    if (!started) return;
    setDiagnosis(null);
    setTargetedLearningDone(false);
    setTargetedFallback(false);
    setCompletionWarning("");
    setSession(createSession(selectedIds, localDate));
  }

  function recordCurrentAttempt(
    answer: QuestionAttempt["answer"],
    valid = true,
  ) {
    if (!session || !currentQuestion || !currentKnowledgePointId) return;
    const attempt: QuestionAttempt = {
      questionId: currentQuestion.id,
      knowledgePointId: currentKnowledgePointId,
      capabilityTag: currentQuestion.capabilityTag,
      answer,
      correct: valid ? isQuestionAnswerCorrect(currentQuestion, answer) : false,
      valid,
      round: session.round,
      answeredAt: new Date().toISOString(),
    };
    setSession(recordAnswer(session, attempt));
    setDraftAnswer(null);
  }

  function submitCurrentAnswer() {
    if (draftAnswer === null || (Array.isArray(draftAnswer) && draftAnswer.length === 0)) return;
    recordCurrentAttempt(draftAnswer);
  }

  const handleInteractionPassed = useCallback(
    (result: InteractionResultMessage) => {
      if (!currentQuestion || typeof currentQuestion.correctAnswer !== "object") return;
      setDraftAnswer({ challengeId: result.challengeId, passed: true });
    },
    [currentQuestion],
  );

  function showDiagnosis() {
    if (!session) return;
    const result = scoreRound(session);
    setDiagnosis(result);
    setSession({ ...session, phase: "diagnosis" });
  }

  function continueAfterDiagnosis() {
    if (!session || !diagnosis) return;
    const next = advanceAfterDiagnosis(session, diagnosis);
    setSession(next);
    setDiagnosis(null);
    setTargetedLearningDone(false);
    setTargetedFallback(false);
  }

  function beginRetest() {
    if (!session || !targetedLearningDone) return;
    setSession(completeTargetedLearning(session));
    setTargetedLearningDone(false);
    setTargetedFallback(false);
  }

  function restart() {
    if (!clearSession(localDate, undefined, storageNamespace)) setStorageWarning(true);
    void removeWorkspaceEntry("mathSessions", localDate);
    setSession(null);
    setDiagnosis(null);
    setSelectedIds([]);
    setTargetedLearningDone(false);
    setTargetedFallback(false);
    setTaskStartWarning("");
    automaticStartAttemptedRef.current = false;
  }

  function replaceCurrentQuestionWithTextFallback() {
    if (!session || !currentPack || !currentQuestion || !roundQuestionKey) return;
    const questions = session.roundQuestions[roundQuestionKey] ?? currentPack.questions;
    setSession({
      ...session,
      roundQuestions: {
        ...session.roundQuestions,
        [roundQuestionKey]: questions.map((question) =>
          question.id === currentQuestion.id ? createTextFallbackQuestion(question) : question,
        ),
      },
    });
  }

  function renderSelection() {
    if (mathTaskAvailability === "completed") {
      return (
        <section className="math-finish-screen is-passed" aria-labelledby="math-completed-title">
          <p>今日任务已完成</p>
          <h1 id="math-completed-title">这份数学诊断已经记入今日路线</h1>
          <span>完成记录来自服务端。为了不覆盖已完成的学习证据，今天不再重新开始这项任务。</span>
          <Link href="/subjects/math/review">继续复习其他章节</Link>
        </section>
      );
    }
    if (isLegacyMathTask) {
      return (
        <section className="math-task-start-gate" aria-labelledby="legacy-math-task-title">
          <p>历史任务兼容模式</p>
          <h1 id="legacy-math-task-title">继续已恢复的旧学习记录</h1>
          <span>这项任务创建时尚未保存课程快照。若没有可恢复的答题草稿，为避免把新课程混入旧记录，今天不能重新生成题目；请回到今日路线查看状态或联系教师。</span>
        </section>
      );
    }
    if (!taskCourseContext) {
      return (
        <section className="math-selection-screen" aria-labelledby="math-selection-title">
          <div className="math-screen-heading">
            <p>课程内容待确认</p>
            <h1 id="math-selection-title">先选择今天要学习的课程内容</h1>
            <span>系统不会用固定教材或演示知识点替代你的真实课程选择。</span>
          </div>
          <CourseContextSelector required />
        </section>
      );
    }
    const visiblePackages = taskCourseContext.knowledgePoints
      .map((point) => getMathKnowledgePackage(point.id))
      .filter((pack): pack is NonNullable<typeof pack> => Boolean(pack));
    return (
      <section className="math-selection-screen" aria-labelledby="math-selection-title">
        <div className="math-screen-heading">
          <p>今天课堂上学了什么？</p>
          <h1 id="math-selection-title">选择今天要检查的知识点</h1>
          <span>可以选一个或多个。系统会按照你的选择顺序，一个一个完成。</span>
        </div>
        <div className="math-book-context">
          <strong>当前可诊断范围</strong>
          <span>已接入七年级上册六章。每个知识点都有测试和讲解，作答结果由服务端核验。</span>
          <div className="math-course-picker">
            <div><small>学科</small><strong>{taskCourseContext.subject}</strong></div>
            <div><small>教材与册别</small><strong>{taskCourseContext.textbookVersion} · {taskCourseContext.grade}年级{taskCourseContext.semester}</strong></div>
            <div><small>章节</small><strong>{taskCourseContext.chapterTitle}</strong></div>
          </div>
        </div>
        {mathTaskAvailability === "available" ? (
          <details className="math-course-adjustment">
            <summary>调整今天的课程内容</summary>
            <p>尚未开始时可以调整；任务开始后，本次诊断会按当前冻结的课程快照继续。</p>
            <CourseContextSelector />
          </details>
        ) : null}
        <div className="math-knowledge-options">
          {visiblePackages.map((pack) => {
            const order = selectedIds.indexOf(pack.id);
            const selected = order >= 0;
            return (
              <button
                type="button"
                aria-pressed={selected}
                className={selected ? "is-selected" : ""}
                key={pack.id}
                onClick={() => toggleKnowledgePoint(pack.id)}
              >
                <span>{selected ? order + 1 : ""}</span>
                <div>
                  <strong>{pack.title}</strong>
                  <small>{pack.questions.length} 道考察题 · {pack.learningMode === "explanation" ? "配套讲解与独立过关题" : `其中 ${pack.questions.filter((question) => question.responseType === "interactive").length} 道互动题`}</small>
                </div>
              </button>
            );
          })}
        </div>
        <div className="math-sticky-action">
          <span>{selectedIds.length ? `已选择 ${selectedIds.length} 个知识点` : "请至少选择一个知识点"}</span>
          <button type="button" disabled={!selectedIds.length || isStartingTask} onClick={() => void startLearning()}>
            {isStartingTask ? "正在确认任务…" : "开始首次测试"}
          </button>
        </div>
      </section>
    );
  }

  function renderTest() {
    if (!session || !currentPack) return null;
    const isRetest = session.phase === "retest";
    if (isRetest && (preparingRetest || activeQuestions.length === 0)) {
      return (
        <section className="math-retest-preparing" role="status">
          <p>正在准备过关测试</p>
          <h1>复习之后，再检验一次掌握情况</h1>
          <span>使用可核验的本地题库，无需配置 API 即可完成。</span>
        </section>
      );
    }
    const completed = currentAttempts.length;
    if (!currentQuestion) {
      return (
        <section className="math-round-ready">
          <span>{isRetest ? "过关测试" : "首次测试"}</span>
          <h1>{activeQuestions.length} 道题已经完成</h1>
          <p>现在查看评分，系统只会根据你刚才的真实答案判断，不会预设薄弱项。</p>
          <button type="button" onClick={showDiagnosis}>提交并查看评分</button>
        </section>
      );
    }

    const hasAnswer =
      draftAnswer !== null && (!Array.isArray(draftAnswer) || draftAnswer.length > 0);
    return (
      <section className="math-test-screen" aria-labelledby="math-question-title">
        <div className="math-test-topline">
          <div>
            <span>{isRetest ? `第 ${session.round} 轮 · 过关测试` : "首次测试"}</span>
            <strong>{currentPack.title}</strong>
          </div>
          <p>第 {completed + 1} / {activeQuestions.length} 题</p>
        </div>
        <div className="math-question-progress"><span style={{ width: `${(completed / activeQuestions.length) * 100}%` }} /></div>
        <div id="math-question-title">
          <MathQuestionRenderer
            pack={currentPack}
            question={currentQuestion}
            answer={draftAnswer}
            onAnswer={setDraftAnswer}
            onInteractionPassed={handleInteractionPassed}
            onUnavailable={replaceCurrentQuestionWithTextFallback}
          />
        </div>
        <div className="math-sticky-action">
          <span>选好后再确认，本题提交后进入下一题。</span>
          <button type="button" disabled={!hasAnswer} onClick={submitCurrentAnswer}>确认答案，下一题</button>
        </div>
      </section>
    );
  }

  function renderDiagnosis() {
    if (!session || !currentPack || !diagnosis) return null;
    return (
      <section className="math-diagnosis-screen" aria-labelledby="math-diagnosis-title">
        <div className={`math-score-summary ${diagnosis.passed ? "is-passed" : "needs-practice"}`}>
          <div><strong>{diagnosis.score}</strong><span>分</span></div>
          <section>
            <p>{diagnosis.passed ? "本轮已过关" : "先补清楚，再来一次"}</p>
            <h1 id="math-diagnosis-title">{currentPack.title}</h1>
            <span>{diagnosis.passed ? "本知识点已经稳定掌握，可以进入下一项内容。" : diagnosis.primaryIssue}</span>
          </section>
        </div>
        <div className="math-diagnosis-list">
          {diagnosis.items.map((item) => (
            <div key={item.capabilityTag}>
              <strong>{item.capabilityTag}</strong>
              <span>{item.correct}/{item.total} 题正确</span>
              <b className={`status-${item.status}`}>{item.status}</b>
            </div>
          ))}
        </div>
        <div className="math-sticky-action">
          <span>{diagnosis.passed ? "继续完成下一个已选知识点。" : "接下来只学习刚才没有掌握的部分。"}</span>
          <button type="button" onClick={continueAfterDiagnosis}>
            {diagnosis.passed ? (session.currentIndex + 1 < session.selectedKnowledgePointIds.length ? "进入下一个知识点" : "完成今日学习") : "开始针对学习"}
          </button>
        </div>
      </section>
    );
  }

  function renderTargetedLearning() {
    if (!session || !currentPack) return null;
    const interactiveQuestion =
      currentPack.questions.find(
        (question) => question.responseType === "interactive" && latestWeakTags.includes(question.capabilityTag),
      ) ?? currentPack.questions.find((question) => question.responseType === "interactive");
    if (currentPack.learningMode === "explanation" || !interactiveQuestion) {
      return (
        <section className="math-targeted-screen" aria-labelledby="math-targeted-title">
          <div className="math-screen-heading">
            <p>只补刚才没掌握的部分</p>
            <h1 id="math-targeted-title">学懂：{currentPack.title}</h1>
            <span>{latestWeakTags.length ? `重点：${latestWeakTags.join("、")}` : "按步骤复习，再用过关题检查。"}</span>
          </div>
          <MathTextStudy pack={currentPack} reviewQuestions={getReviewQuestions(currentPack, currentAttempts)}
            onComplete={() => setTargetedLearningDone(true)} />
          <div className="math-sticky-action">
            <span>{targetedLearningDone ? "已确认复习，接下来用题目检验。" : "先复习讲解与错题，再确认开始测试。"}</span>
            <button type="button" disabled={!targetedLearningDone} onClick={beginRetest}>开始过关测试</button>
          </div>
        </section>
      );
    }
    const fallbackExplanations = currentPack.questions
      .filter((question) => !latestWeakTags.length || latestWeakTags.includes(question.capabilityTag))
      .map((question) => question.explanation)
      .filter((explanation, index, items) => items.indexOf(explanation) === index)
      .slice(0, 3);
    return (
      <section className="math-targeted-screen" aria-labelledby="math-targeted-title">
        <div className="math-screen-heading">
          <p>只补刚才没掌握的部分</p>
          <h1 id="math-targeted-title">动手弄懂：{currentPack.title}</h1>
          <span>{latestWeakTags.length ? `重点：${latestWeakTags.join("、")}` : "完成互动后进入过关测试。"}</span>
        </div>
        {targetedFallback ? (
          <section className="math-targeted-fallback" aria-label="备用文字讲解">
            <p>互动图形暂时不可用</p>
            <h2>先看懂这三个关键点</h2>
            <ol>
              {fallbackExplanations.map((explanation) => <li key={explanation}>{explanation}</li>)}
            </ol>
            <button type="button" onClick={() => setTargetedLearningDone(true)}>我已看懂这些关键点</button>
          </section>
        ) : (
          <MathInteractionQuestion
            question={interactiveQuestion}
            unavailableLabel="改用文字讲解"
            onPassed={() => setTargetedLearningDone(true)}
            onUnavailable={() => setTargetedFallback(true)}
          />
        )}
        <div className="math-sticky-action">
          <span>{targetedLearningDone ? "互动学习已完成，可以再次测试。" : "完成图形中的操作和即时挑战后才能继续。"}</span>
          <button type="button" disabled={!targetedLearningDone} onClick={beginRetest}>开始过关测试</button>
        </div>
      </section>
    );
  }

  function renderCurrentPhase() {
    if (!session && mathTaskAvailability === "completed") return renderSelection();
    if (!session) return renderSelection();
    if (!mathTaskId) {
      return (
        <section className="math-task-start-gate" role="status">
          <p>今日任务待生成</p>
          <h1>请先确认课程内容</h1>
          <span>为了让结果真实记入学习记录，系统需要先从服务端生成今天的数学任务。</span>
          <CourseContextSelector required />
        </section>
      );
    }
    if (mathTaskAvailability === "available") {
      return (
        <section className="math-task-start-gate" role="status">
          <p>正在确认今日任务</p>
          <h1>先确认服务端，再继续本次诊断</h1>
          <span>{taskStartWarning || "正在确认这份已恢复的草稿能否继续记入今天的学习路线。"}</span>
          {taskStartWarning ? (
            <button type="button" disabled={isStartingTask} onClick={() => void confirmMathTaskStart()}>
              {isStartingTask ? "正在重新确认…" : "重新确认并继续"}
            </button>
          ) : null}
        </section>
      );
    }
    if (session.phase === "diagnostic" || session.phase === "retest") return renderTest();
    if (session.phase === "diagnosis") return renderDiagnosis();
    if (session.phase === "learning") return renderTargetedLearning();
    if (session.phase === "needs-help") {
      return (
        <section className="math-finish-screen needs-help">
          <p>已经认真完成三轮</p>
          <h1>把这次结果交给老师一起看看</h1>
          <span>系统已保存答题记录。建议请老师针对薄弱步骤讲解后，再重新开始。</span>
          <Link href="/subjects/math/review">打开章节讲解与自查练习</Link>
          <button type="button" onClick={restart}>重新选择学习内容</button>
        </section>
      );
    }
    return (
      <section className="math-finish-screen is-passed">
        <p>今日目标已完成</p>
        <h1>所有已选知识点都过关了</h1>
        <span>{mathTaskAvailability === "completed"
          ? "课堂诊断已记入今日路线，后续任务会按今天的安排解锁。"
          : "正在把课堂诊断写入今日学习路线。"}</span>
        <Link href="/subjects/math/review">继续复习其他章节</Link>
        {completionWarning && mathTaskAvailability === "in_progress" ? (
          <button type="button" onClick={() => {
            if (completionRequestedRef.current) return;
            setCompletionWarning("");
            setCompletionRetry(current => current + 1);
          }}>重新保存学习结果</button>
        ) : null}
      </section>
    );
  }

  if (!isReady) return <div className="math-learning-loading">正在读取今天的真实学习任务...</div>;

  if (courseContextRequired || !mathTask) {
    return (
      <section className="math-learning-workspace" data-learning-phase="course-selection">
        <CourseContextSelector required />
      </section>
    );
  }

  if (!restored) return <div className="math-learning-loading">正在恢复今天的学习进度...</div>;

  return (
    <section className="math-learning-workspace" data-learning-phase={session?.phase ?? "selection"}>
      {storageWarning ? (
        <p className="math-storage-warning" role="alert">
          当前浏览器无法保存学习记录。你仍可继续学习，但请暂时不要关闭页面。
        </p>
      ) : null}
      {workspaceWarning ? <p className="math-storage-warning" role="alert">{workspaceWarning}</p> : null}
      {isLegacyMathTask ? (
        <p className="math-storage-warning" role="status">
          这是迁移前创建的任务，当前课程选择不会改写它；系统只会继续已保存的答题草稿。
        </p>
      ) : null}
      {taskStartWarning ? <p className="math-storage-warning" role="alert">{taskStartWarning}</p> : null}
      {completionWarning ? <p className="math-storage-warning" role="alert">{completionWarning}</p> : null}
      <div className="math-flow-header" aria-label="今日学习五步流程">
        {STUDENT_FLOW_STEPS.map((step, index) => (
          <div className={index === phaseStep(session) ? "is-current" : index < phaseStep(session) ? "is-done" : ""} key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
      <section className="math-phase-stage" aria-label="当前学习步骤">{renderCurrentPhase()}</section>
      <p className="workbench-inline-note">正在进行的诊断会保留当前内容。<Link href="/subjects/math/review">随时打开其他章节复习</Link></p>
    </section>
  );
}
