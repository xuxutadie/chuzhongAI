export type InteractiveLessonProgress = Record<string, { completedAt: string; note: string }>;

/** 防御损坏的本地数据，避免数组、null 等值让互动课页面崩溃。 */
export function parseInteractiveLessonProgress(value: string | null): InteractiveLessonProgress {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([lessonId, item]) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        return typeof record.completedAt === "string" && typeof record.note === "string"
          ? [[lessonId, { completedAt: record.completedAt, note: record.note }]]
          : [];
      }),
    ) as InteractiveLessonProgress;
  } catch {
    return {};
  }
}

export function getInteractiveFallbackMessage(lessonTitle: string) {
  return `“${lessonTitle}”互动课件暂时无法加载。请改用文字替代：阅读本页学习目标，写下你观察到的规律，再确认完成文字自检。`;
}
