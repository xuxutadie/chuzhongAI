import englishUpper from "../../../shared/curriculum/language/english-7-upper.json" with { type: "json" };
import englishLower from "../../../shared/curriculum/language/english-7-lower.json" with { type: "json" };
import chineseUpper from "../../../shared/curriculum/language/chinese-7-upper.json" with { type: "json" };
import chineseLower from "../../../shared/curriculum/language/chinese-7-lower.json" with { type: "json" };

export type LanguageQuestion = {
  id: string; skillId: string; prompt: string;
  options: Array<{ id: string; text: string }>; answer: string; explanation: string;
};
export type LanguageUnit = {
  id: string; title: string; page: number; pdfPage: number; focus: string; writingPrompt: string; lessons?: string[];
  skills: Array<{ id: string; title: string; guide: string }>;
  questions: LanguageQuestion[]; retestQuestions: LanguageQuestion[];
};
export type LanguageBook = {
  id: string; subject: string; semester: string; edition: string; grade: number; sourceFile: string;
  units: LanguageUnit[];
};
export const languageBooks: LanguageBook[] = [englishUpper, englishLower, chineseUpper, chineseLower];
export function findLanguageUnit(id: string) {
  for (const book of languageBooks) {
    const unit = book.units.find(item => item.id === id);
    if (unit) return { book, unit };
  }
  return null;
}
export function languageSubjectPath(subject: string) { return subject === "英语" ? "english" : "chinese"; }
export function languageTaskId(unitId: string) { return `language-${unitId}`; }

export type LanguageSessionAccess = "not-started" | "started" | "completed" | "offline-draft";

/**
 * 任务服务短时不可用时，允许学生继续填写已经保存过的当天草稿。
 * 该状态只开放草稿编辑，最终完成仍须由服务端重新确认任务。
 */
export function resolveLanguageSessionAccess(
  taskStatus: string | null,
  hasStoredDraft: boolean,
  taskSyncUnavailable: boolean,
): LanguageSessionAccess {
  if (taskStatus === "completed") return "completed";
  if (taskStatus === "in_progress") return "started";
  if (taskStatus === null && hasStoredDraft && taskSyncUnavailable) return "offline-draft";
  return "not-started";
}

export function assertLanguageSessionDay(sessionDay: string, currentDay: string) {
  if (sessionDay !== currentDay) {
    throw new Error("日期已变化，请刷新页面开始今天的单元；昨天的草稿已保留。");
  }
}

/** 日期校验必须先于创建任务，避免新日任务与旧日草稿发生错配。 */
export async function startLanguageSessionForDay<T>(
  sessionDay: string,
  currentDay: string,
  start: () => Promise<T>,
) {
  assertLanguageSessionDay(sessionDay, currentDay);
  return start();
}

export function gradeLanguageAnswers(questions: LanguageQuestion[], answers: Record<string, string>) {
  const answered = questions.filter(q => q.options.some(o => o.id === answers[q.id])).length;
  const wrong = questions.filter(q => answers[q.id] !== q.answer);
  return { answered, wrong, correct: questions.length - wrong.length, allCorrect: answered === questions.length && wrong.length === 0 };
}

export type LanguageDraft = {
  version: 1; phase: "diagnosis" | "study" | "retest" | "result";
  diagnosis: Record<string, string>; retest: Record<string, string>;
  writing: string; reflection: string; reviewed: boolean;
};
export function restoreLanguageDraft(unit: LanguageUnit, value: unknown): LanguageDraft {
  const raw = value && typeof value === "object" ? value as Partial<LanguageDraft> : {};
  const sanitize = (questions: LanguageQuestion[], values: unknown) => {
    const source = values && typeof values === "object" ? values as Record<string, unknown> : {};
    return Object.fromEntries(questions.flatMap(q => q.options.some(o => o.id === source[q.id]) ? [[q.id, source[q.id] as string]] : []));
  };
  const diagnosis = sanitize(unit.questions, raw.diagnosis);
  const retest = sanitize(unit.retestQuestions, raw.retest);
  let phase = ["diagnosis", "study", "retest", "result"].includes(raw.phase ?? "") ? raw.phase! : "diagnosis";
  if (gradeLanguageAnswers(unit.questions, diagnosis).answered !== unit.questions.length) phase = "diagnosis";
  else if (phase === "result" && gradeLanguageAnswers(unit.retestQuestions, retest).answered !== unit.retestQuestions.length) phase = "retest";
  return { version: 1, phase, diagnosis, retest, reviewed: raw.reviewed === true,
    writing: typeof raw.writing === "string" ? raw.writing.slice(0, 1400) : "",
    reflection: typeof raw.reflection === "string" ? raw.reflection.slice(0, 1000) : "" };
}
