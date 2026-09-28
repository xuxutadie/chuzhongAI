type LessonCompletionPayload = {
  type?: unknown;
  lessonId?: unknown;
};

type MathInteractionPayload = {
  type?: unknown;
  lessonId?: unknown;
  knowledgePointId?: unknown;
  section?: unknown;
  difficulty?: unknown;
  challengeId?: unknown;
  passed?: unknown;
  attempts?: unknown;
};

const mathSectionKnowledgePoints = {
  shapes: "g7u-shapes-solid",
  fold: "g7u-shapes-folding",
  cut: "g7u-shapes-section",
  views: "g7u-shapes-views",
} as const;

const mathDifficulties = new Set(["basic", "advanced", "challenge"]);

export function isLessonCompletionMessage(
  messageOrigin: string,
  appOrigin: string,
  data: unknown,
  lessonId: string
) {
  if (messageOrigin !== appOrigin || typeof data !== "object" || data === null) {
    return false;
  }

  const payload = data as LessonCompletionPayload;
  return payload.type === "interactive-lesson-complete" && payload.lessonId === lessonId;
}

export function isMathInteractionResultMessage(
  messageOrigin: string,
  appOrigin: string,
  data: unknown,
  expectedKnowledgePointId: string,
) {
  if (messageOrigin !== appOrigin || typeof data !== "object" || data === null) {
    return false;
  }

  const payload = data as MathInteractionPayload;
  if (
    payload.type !== "math-interaction-result" ||
    payload.lessonId !== "g7-upper-shapes" ||
    payload.knowledgePointId !== expectedKnowledgePointId ||
    typeof payload.section !== "string" ||
    !(payload.section in mathSectionKnowledgePoints) ||
    typeof payload.difficulty !== "string" ||
    !mathDifficulties.has(payload.difficulty) ||
    typeof payload.challengeId !== "string" ||
    payload.challengeId.length === 0 ||
    typeof payload.passed !== "boolean" ||
    !Number.isInteger(payload.attempts) ||
    (payload.attempts as number) < 1
  ) {
    return false;
  }

  return (
    mathSectionKnowledgePoints[payload.section as keyof typeof mathSectionKnowledgePoints] ===
    payload.knowledgePointId
  );
}

function getLocalDateKey(date: Date) {
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isCompletionFromLocalDate(completedAt: string, now = new Date()) {
  return getLocalDateKey(new Date(completedAt)) === getLocalDateKey(now);
}
