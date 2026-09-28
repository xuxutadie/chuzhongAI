import type { MathLearningSession } from "./types";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type GuidedTaskDraft = {
  activeStep: number;
  answers: Record<string, string>;
  reflection: string;
};

export type InteractiveLessonDraft = {
  reflection: string;
  hasCompletedInteractive: boolean;
};

const STORAGE_PREFIX = "math-learning-session-v1:";
const GUIDED_TASK_DRAFT_PREFIX = "guided-task-draft-v1:";
const INTERACTIVE_LESSON_DRAFT_PREFIX = "interactive-lesson-draft-v1:";
const LEARNING_PHASES = new Set([
  "diagnostic",
  "diagnosis",
  "learning",
  "retest",
  "passed",
  "needs-help",
]);

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    // 隐私模式或浏览器策略可能禁止访问本地存储，页面仍应继续可用。
    return null;
  }
}

function readStoredValue(key: string, storage: StorageLike | null) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string, storage: StorageLike | null) {
  try {
    storage?.setItem(key, value);
    return storage !== null;
  } catch {
    return false;
  }
}

function removeStoredValue(key: string, storage: StorageLike | null) {
  try {
    storage?.removeItem(key);
    return storage !== null;
  } catch {
    return false;
  }
}

function scopedStorageKey(prefix: string, identifier: string, namespace = "") {
  const safeNamespace = namespace.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix}${safeNamespace ? `${safeNamespace}:` : ""}${identifier}`;
}

function isLearningSession(value: unknown): value is MathLearningSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<MathLearningSession>;
  const scores = Array.isArray(session.scores) ? session.scores : [];
  const hasValidPassedEvidence =
    session.phase !== "passed" || (
      session.currentIndex === (session.selectedKnowledgePointIds?.length ?? 0) - 1 &&
      scores.length >= (session.selectedKnowledgePointIds?.length ?? 0) &&
      (scores.at(-1)?.score ?? 0) >= 98
    );

  return (
    typeof session.id === "string" &&
    typeof session.localDate === "string" &&
    Array.isArray(session.selectedKnowledgePointIds) &&
    session.selectedKnowledgePointIds.length > 0 &&
    session.selectedKnowledgePointIds.every((id) => typeof id === "string" && id.length > 0) &&
    typeof session.currentIndex === "number" &&
    Number.isInteger(session.currentIndex) &&
    session.currentIndex >= 0 &&
    session.currentIndex < session.selectedKnowledgePointIds.length &&
    (session.round === 1 || session.round === 2 || session.round === 3) &&
    typeof session.phase === "string" &&
    LEARNING_PHASES.has(session.phase) &&
    Array.isArray(session.answers) &&
    Array.isArray(session.interactionResults) &&
    Array.isArray(session.scores) &&
    typeof session.roundQuestions === "object" &&
    session.roundQuestions !== null &&
    hasValidPassedEvidence
  );
}

export function saveSession(
  session: MathLearningSession,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return writeStoredValue(scopedStorageKey(STORAGE_PREFIX, session.localDate, namespace), JSON.stringify(session), storage);
}

export function loadSession(
  localDate: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
): MathLearningSession | null {
  const serialized = readStoredValue(scopedStorageKey(STORAGE_PREFIX, localDate, namespace), storage);
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    return isLearningSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearSession(
  localDate: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return removeStoredValue(scopedStorageKey(STORAGE_PREFIX, localDate, namespace), storage);
}

function isGuidedTaskDraft(value: unknown): value is GuidedTaskDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<GuidedTaskDraft>;
  return (
    typeof draft.activeStep === "number" &&
    Number.isInteger(draft.activeStep) &&
    draft.activeStep >= 0 &&
    draft.activeStep <= 2 &&
    typeof draft.answers === "object" &&
    draft.answers !== null &&
    Object.values(draft.answers).every((answer) => typeof answer === "string") &&
    typeof draft.reflection === "string"
  );
}

function isInteractiveLessonDraft(value: unknown): value is InteractiveLessonDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<InteractiveLessonDraft>;
  return typeof draft.reflection === "string" && typeof draft.hasCompletedInteractive === "boolean";
}

function loadDraft<T>(key: string, validator: (value: unknown) => value is T, storage: StorageLike | null) {
  const serialized = readStoredValue(key, storage);
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    return validator(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGuidedTaskDraft(
  taskId: string,
  draft: GuidedTaskDraft,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return writeStoredValue(scopedStorageKey(GUIDED_TASK_DRAFT_PREFIX, taskId, namespace), JSON.stringify(draft), storage);
}

export function loadGuidedTaskDraft(
  taskId: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return loadDraft(scopedStorageKey(GUIDED_TASK_DRAFT_PREFIX, taskId, namespace), isGuidedTaskDraft, storage);
}

export function clearGuidedTaskDraft(
  taskId: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return removeStoredValue(scopedStorageKey(GUIDED_TASK_DRAFT_PREFIX, taskId, namespace), storage);
}

export function saveInteractiveLessonDraft(
  lessonId: string,
  draft: InteractiveLessonDraft,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return writeStoredValue(scopedStorageKey(INTERACTIVE_LESSON_DRAFT_PREFIX, lessonId, namespace), JSON.stringify(draft), storage);
}

export function loadInteractiveLessonDraft(
  lessonId: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return loadDraft(scopedStorageKey(INTERACTIVE_LESSON_DRAFT_PREFIX, lessonId, namespace), isInteractiveLessonDraft, storage);
}

export function clearInteractiveLessonDraft(
  lessonId: string,
  storage: StorageLike | null = getBrowserStorage(),
  namespace = "",
) {
  return removeStoredValue(scopedStorageKey(INTERACTIVE_LESSON_DRAFT_PREFIX, lessonId, namespace), storage);
}
