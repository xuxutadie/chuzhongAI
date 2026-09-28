import type {
  MathDiagnosis,
  MathDiagnosisItem,
  MathLearningSession,
  MathQuestion,
  QuestionAttempt,
} from "./types";

const PASS_SCORE = 98;

function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `math-session-${Date.now()}`;
}

export function createSession(
  selectedKnowledgePointIds: string[],
  localDate: string,
  id = createSessionId(),
): MathLearningSession {
  return {
    id,
    localDate,
    selectedKnowledgePointIds: [...selectedKnowledgePointIds],
    currentIndex: 0,
    round: 1,
    phase: "diagnostic",
    answers: [],
    interactionResults: [],
    scores: [],
    roundQuestions: {},
  };
}

export function getCurrentKnowledgePointId(session: MathLearningSession) {
  return session.selectedKnowledgePointIds[session.currentIndex] ?? null;
}

export function recordAnswer(
  session: MathLearningSession,
  attempt: QuestionAttempt,
): MathLearningSession {
  const answers = session.answers.filter(
    (item) =>
      !(
        item.questionId === attempt.questionId &&
        item.knowledgePointId === attempt.knowledgePointId &&
        item.round === attempt.round
      ),
  );

  return { ...session, answers: [...answers, attempt] };
}

export function isQuestionAnswerCorrect(
  question: MathQuestion,
  answer: QuestionAttempt["answer"],
) {
  if (Array.isArray(question.correctAnswer)) {
    if (!Array.isArray(answer)) return false;
    return (
      question.correctAnswer.length === answer.length &&
      [...question.correctAnswer].sort().every((value, index) => value === [...answer].sort()[index])
    );
  }
  if (typeof question.correctAnswer === "object") {
    return (
      typeof answer === "object" &&
      !Array.isArray(answer) &&
      answer.challengeId === question.correctAnswer.challengeId &&
      answer.passed === true
    );
  }
  return answer === question.correctAnswer;
}

export function createTextFallbackQuestion(question: MathQuestion): MathQuestion {
  // 普通选择题本身仍有可读的题干和选项。图形不可用时只移除图形，
  // 保留原题和原答案，不能把任何题都替换成固定的“正确”。
  if (question.responseType !== "interactive") {
    return {
      ...question,
      id: `${question.id}-text-fallback`,
      prompt: `互动图形暂时不可用，请根据题目文字作答：${question.prompt}`,
      visual: undefined,
    };
  }

  // 互动题没有普通选项，才提供与该互动目标对应的文字判断题。
  // 服务端只认可题库中明确登记的互动备用题，避免客户端伪造题号绕过判分。
  return {
    ...question,
    id: `${question.id}-text-fallback`,
    responseType: "true-false",
    prompt: `图形暂时不可用，请根据文字说明判断：${question.explanation}`,
    options: [
      { id: "true", text: "正确" },
      { id: "false", text: "错误" },
    ],
    correctAnswer: "true",
    visual: undefined,
  };
}

function diagnosisStatus(rate: number): MathDiagnosisItem["status"] {
  if (rate >= 0.8) return "掌握";
  if (rate >= 0.6) return "需巩固";
  return "未理解";
}

export function buildDiagnosis(attempts: QuestionAttempt[]): MathDiagnosis {
  const correctCount = attempts.filter((attempt) => attempt.valid && attempt.correct).length;
  const score = attempts.length
    ? Math.round((correctCount / attempts.length) * 100)
    : 0;
  const groups = new Map<string, { correct: number; total: number }>();

  for (const attempt of attempts.filter((attempt) => attempt.valid)) {
    const group = groups.get(attempt.capabilityTag) ?? { correct: 0, total: 0 };
    group.total += 1;
    if (attempt.correct) group.correct += 1;
    groups.set(attempt.capabilityTag, group);
  }

  let items = [...groups.entries()].map(([capabilityTag, group]) => {
    const rate = group.correct / group.total;
    return {
      capabilityTag,
      correct: group.correct,
      total: group.total,
      rate,
      status: diagnosisStatus(rate),
    } satisfies MathDiagnosisItem;
  });
  const passed = score >= PASS_SCORE;
  if (passed) {
    items = items.map((item) => ({ ...item, status: "掌握" }));
  }
  const weakTags = passed ? [] : items
    .filter((item) => item.correct < item.total)
    .map((item) => item.capabilityTag);

  return {
    score,
    passed,
    items,
    weakTags,
    primaryIssue: weakTags.length ? `需要重点巩固：${weakTags.join("、")}。` : null,
  };
}

export function scoreRound(session: MathLearningSession) {
  const knowledgePointId = getCurrentKnowledgePointId(session);
  return buildDiagnosis(
    session.answers.filter(
      (attempt) =>
        attempt.knowledgePointId === knowledgePointId && attempt.round === session.round,
    ),
  );
}

export function advanceAfterDiagnosis(
  session: MathLearningSession,
  diagnosis: MathDiagnosis,
): MathLearningSession {
  const scores = [
    ...session.scores,
    { round: session.round, score: diagnosis.score, weakTags: [...diagnosis.weakTags] },
  ];

  if (!diagnosis.passed) {
    return {
      ...session,
      scores,
      phase: session.round >= 3 ? "needs-help" : "learning",
    };
  }

  const nextIndex = session.currentIndex + 1;
  if (nextIndex >= session.selectedKnowledgePointIds.length) {
    return { ...session, scores, phase: "passed" };
  }

  return {
    ...session,
    scores,
    currentIndex: nextIndex,
    round: 1,
    phase: "diagnostic",
  };
}

export function completeTargetedLearning(session: MathLearningSession): MathLearningSession {
  if (session.phase !== "learning") return session;
  const nextRound = Math.min(session.round + 1, 3) as 1 | 2 | 3;
  return { ...session, round: nextRound, phase: "retest" };
}
