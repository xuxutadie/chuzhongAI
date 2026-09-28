export type StoredTaskStatus = "not_started" | "in_progress" | "completed";

export type StoredTaskProgress = {
  status: StoredTaskStatus;
  startedAt?: string;
  completedAt?: string;
  reflection?: string;
};

export type DailyLearningProgress = {
  version: 1;
  dateKey: string;
  tasks: Record<string, StoredTaskProgress>;
  growthEarned: number;
};

export type TaskAvailability = "locked" | "available" | "in_progress" | "completed";

export type LearningProgressStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DAILY_PROGRESS_STORAGE_PREFIX = "student-daily-learning-progress-v1:";
const LEGACY_DAILY_PROGRESS_STORAGE_KEY = "student-daily-learning-progress-v1";

/**
 * 每天使用独立的存储键，避免今天的学习动作覆盖昨天的学习记录。
 */
export function getDailyProgressStorageKey(dateKey: string, namespace = "") {
  const safeNamespace = namespace.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${DAILY_PROGRESS_STORAGE_PREFIX}${safeNamespace ? `${safeNamespace}:` : ""}${dateKey}`;
}

export function createDailyProgress(taskIds: string[], dateKey: string): DailyLearningProgress {
  return {
    version: 1,
    dateKey,
    tasks: Object.fromEntries(
      taskIds.map((taskId) => [taskId, { status: "not_started" as const }])
    ),
    growthEarned: 0
  };
}

export function restoreDailyProgress(
  value: unknown,
  taskIds: string[],
  dateKey: string
): DailyLearningProgress {
  if (!value || typeof value !== "object") {
    return createDailyProgress(taskIds, dateKey);
  }

  const candidate = value as Partial<DailyLearningProgress>;
  if (candidate.version !== 1 || candidate.dateKey !== dateKey || !candidate.tasks) {
    return createDailyProgress(taskIds, dateKey);
  }

  const fresh = createDailyProgress(taskIds, dateKey);
  for (const taskId of taskIds) {
    const stored = candidate.tasks[taskId];
    if (stored && ["not_started", "in_progress", "completed"].includes(stored.status)) {
      fresh.tasks[taskId] = stored;
    }
  }

  fresh.growthEarned = Math.max(0, Number(candidate.growthEarned) || 0);
  return fresh;
}

function readStoredProgress(storage: LearningProgressStorage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/**
 * 读取当天进度。旧版单键数据仅在日期完全匹配时迁移，绝不把旧日记录当作今天的数据。
 */
export function loadDailyProgress(
  taskIds: string[],
  dateKey: string,
  storage: LearningProgressStorage | null,
  namespace = "",
) {
  const currentValue = readStoredProgress(storage, getDailyProgressStorageKey(dateKey, namespace));
  const legacyValue = currentValue === null
    ? readStoredProgress(storage, LEGACY_DAILY_PROGRESS_STORAGE_KEY)
    : null;
  const serialized = currentValue ?? legacyValue;

  if (!serialized) return createDailyProgress(taskIds, dateKey);

  try {
    return restoreDailyProgress(JSON.parse(serialized) as unknown, taskIds, dateKey);
  } catch {
    return createDailyProgress(taskIds, dateKey);
  }
}

/**
 * 保存当天进度。浏览器禁用本地存储时返回 false，让页面保留内存状态并提示学生。
 */
export function saveDailyProgress(
  progress: DailyLearningProgress,
  storage: LearningProgressStorage | null,
  namespace = "",
) {
  try {
    storage?.setItem(getDailyProgressStorageKey(progress.dateKey, namespace), JSON.stringify(progress));
    return storage !== null;
  } catch {
    return false;
  }
}

export function getTaskAvailability(
  progress: DailyLearningProgress,
  taskIds: string[],
  taskId: string
): TaskAvailability {
  const taskIndex = taskIds.indexOf(taskId);
  if (taskIndex < 0) {
    return "locked";
  }

  const task = progress.tasks[taskId];
  if (task?.status === "completed") {
    return "completed";
  }

  // 自主选择的语言单元独立开放；也不能反过来阻断原有每日路线。
  if (taskId.startsWith("language-")) {
    return task?.status === "in_progress" ? "in_progress" : "available";
  }

  const prerequisitesComplete = taskIds
    .slice(0, taskIndex)
    .filter((previousId) => !previousId.startsWith("language-"))
    .every((previousId) => progress.tasks[previousId]?.status === "completed");

  if (!prerequisitesComplete) {
    return "locked";
  }

  return task?.status === "in_progress" ? "in_progress" : "available";
}

export function getCurrentTaskId(
  progress: DailyLearningProgress,
  taskIds: string[]
): string | null {
  return taskIds.find((taskId) => progress.tasks[taskId]?.status !== "completed") ?? null;
}

export function getCompletedTaskCount(progress: DailyLearningProgress, taskIds: string[]) {
  return taskIds.filter((taskId) => progress.tasks[taskId]?.status === "completed").length;
}

export function getCompletionRate(progress: DailyLearningProgress, taskIds: string[]) {
  if (taskIds.length === 0) {
    return 0;
  }
  return Math.round((getCompletedTaskCount(progress, taskIds) / taskIds.length) * 100);
}

export function startTask(
  progress: DailyLearningProgress,
  taskIds: string[],
  taskId: string,
  startedAt: string
): DailyLearningProgress {
  const availability = getTaskAvailability(progress, taskIds, taskId);
  if (availability !== "available") {
    return progress;
  }

  return {
    ...progress,
    tasks: {
      ...progress.tasks,
      [taskId]: {
        ...progress.tasks[taskId],
        status: "in_progress",
        startedAt
      }
    }
  };
}

export function completeTask(
  progress: DailyLearningProgress,
  taskIds: string[],
  taskId: string,
  reflection: string,
  completedAt: string
): DailyLearningProgress {
  if (getTaskAvailability(progress, taskIds, taskId) !== "in_progress") {
    return progress;
  }

  return {
    ...progress,
    growthEarned: progress.growthEarned + 40,
    tasks: {
      ...progress.tasks,
      [taskId]: {
        ...progress.tasks[taskId],
        status: "completed",
        completedAt,
        reflection: reflection.trim()
      }
    }
  };
}
