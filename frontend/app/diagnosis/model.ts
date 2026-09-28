import { requestJson } from "../student-api.ts";
import interviewData from "../../../shared/diagnosis-interview.json" with { type: "json" };

export type ProfileFields = {
  nickname: string; grade: string; school_name: string; class_name: string; textbook: string; exam_score: number | null; exam_total: number | null;
  exam_date: string; weak_topics: string; goal: string; daily_minutes: number | null; answered_fields: string[];
  learning_details: Record<string, string>;
};
export type Profile = { fields: Partial<ProfileFields>; confirmed: boolean; revision: number };
export function needsSchoolSupplement(profile: Profile) {
  return profile.confirmed && (!profile.fields.school_name?.trim() || !profile.fields.class_name?.trim());
}
export type DiagramElement = { kind: "line"; x1: number; y1: number; x2: number; y2: number; dashed?: boolean }
  | { kind: "text"; x: number; y: number; text: string }
  | { kind: "polygon"; points: number[][]; fill?: string }
  | { kind: "sector"; cx: number; cy: number; r: number; startAngle: number; endAngle: number; fill: string }
  | { kind: "circle"; cx: number; cy: number; r: number };
export type Diagram = { width: number; height: number; alt: string; caption?: string; elements: DiagramElement[] };
export type Question = { id: string; dimension: number; text: string; options: Record<string, string>; stage: string; difficulty: string; diagram?: Diagram };
export type Dimension = { name: string; score: number; correct: number; sample_size: number; skipped: number; advice: string };
export type Evidence = Question & { answer: string; explanation: string; chosen: string | null; state: "correct" | "wrong" | "skipped" };
export type Report = { score: number; distribution: { correct: number; wrong: number; skipped: number }; dimensions: Dimension[];
  evidence: Evidence[]; priority: string[]; interpretation: string | null; interpretation_mode: string; notice: string; version: string };
export type Attempt = { id: string; status: "active" | "submitted"; revision: number; profile: Partial<ProfileFields>;
  paper: Question[]; answers: Record<string, string | null>; times: Record<string, number>; report: Report | null;
  created_at: string; submitted_at: string | null; version: string };
export type DiagnosisState = { profile: Profile; attempt: Attempt | null; supported: boolean;
  history: { id: string; status: string; created_at: string; submitted_at: string | null }[] };
export function needsInitialDiagnosis(state: DiagnosisState) {
  return !state.profile.confirmed || (state.supported && !state.history.some(item => item.status === "submitted"));
}
export function shouldOpenSavedReport(state: Pick<DiagnosisState, "profile" | "attempt">) {
  // 重新建档优先于历史报告；不能因旧报告存在而把学生送离访谈。
  return state.profile.confirmed && state.attempt?.status === "submitted";
}
export function hasDiagnosisReport(state: Pick<DiagnosisState, "attempt" | "history">) {
  return state.attempt?.status === "submitted" || state.history.some(item => item.status === "submitted");
}
export function startDiagnosisAttempt(state: Pick<DiagnosisState, "attempt" | "history">) {
  // 只有学生明确点击入口后调用；未完成的试卷优先续答，旧报告不会被覆盖。
  const retest = state.attempt?.status !== "active" && hasDiagnosisReport(state);
  return diagnosisApi<Attempt>("/attempts", { retest });
}
export type InterviewReply = { field: string; input: string; total: string };
export function interviewReplyFor(field: string, reply: InterviewReply | null, nickname = "") {
  // 按问题归属读取输入，同一轮渲染就隔离旧答案，不等待 effect 清空。
  return reply?.field === field
    ? { input: reply.input, total: reply.total }
    : { input: field === "nickname" ? nickname : "", total: "" };
}
export const dimensions = ["数与运算", "分数与百分数", "比与比例", "图形与测量", "数据与统计", "代数初步"];
export const interview = interviewData;
export function interviewFor(fields: Partial<ProfileFields>) {
  return interview.filter(row => {
    if (!row.when) return true;
    const value = String(fields[row.when.field as keyof ProfileFields] ?? fields.learning_details?.[row.when.field] ?? "");
    return Boolean(value) && (!row.when.contains.length || row.when.contains.some(word => value.includes(word)));
  });
}
export const emptyFields: ProfileFields = { nickname: "", grade: "", school_name: "", class_name: "", textbook: "", exam_score: null, exam_total: null,
  exam_date: "", weak_topics: "", goal: "", daily_minutes: null, answered_fields: [], learning_details: {} };
export function diagnosisApi<T>(path = "", body?: unknown, method = "POST", signal?: AbortSignal) {
  return requestJson<T>(`/api/diagnosis${path}`, body === undefined
    ? { signal } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
}
export function answerLabel(fields: Partial<ProfileFields>, field: string): string {
  if (field === "exam") return fields.exam_score == null ? "暂不填写" : `${fields.exam_score} / ${fields.exam_total} 分`;
  const value = fields[field as keyof ProfileFields] ?? fields.learning_details?.[field];
  return value === undefined || value === null || value === "" ? "暂不填写" : `${value}${field === "daily_minutes" ? " 分钟" : ""}`;
}
