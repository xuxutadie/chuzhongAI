/**
 * 学生端仅调用 Next 同源接口。会话令牌由 HttpOnly Cookie 管理，
 * 因此这里不保存、不读取，也不拼接任何 Authorization 头。
 */

import {
  getExpectedSessionUserId,
  getSessionEpoch,
} from "./session_epoch.js";
import {
  isSessionContextChangedResponse,
  SESSION_CONTEXT_CHANGED_HEADER,
} from "./session_context_change.js";

export { SESSION_CONTEXT_CHANGED_HEADER } from "./session_context_change.js";
import { normalizePersonalAIConfig, type AIConfigKind, type PersonalConfigUpdate } from "./ai-config-model.ts";
import type { StudentRegistrationInput } from "./student-registration-model";
import { isSubjectEnabled } from "./subject-visibility.js";

export type WorkspaceRole = "admin" | "student" | "parent" | "coach" | "teacher";

export type CurrentWorkspaceUser = {
  id: number;
  username: string;
  display_name: string;
  role: WorkspaceRole;
  grade: string | null;
  ai_access_mode?: "personal" | "managed";
};

/** 旧账号兼容教师托管模式；只接收公开资料，避免携带未知秘密字段。 */
export function normalizeWorkspaceUser(user: CurrentWorkspaceUser): CurrentWorkspaceUser {
  return { id: user.id, username: user.username, display_name: user.display_name, role: user.role, grade: user.grade ?? null, ai_access_mode: user.ai_access_mode === "personal" ? "personal" : "managed" };
}

export type TodayTaskStatus = "not_started" | "in_progress" | "completed";

export type CourseKnowledgePoint = {
  id: string;
  title: string;
};

export type CourseChapter = {
  id: string;
  title: string;
  knowledgePoints: CourseKnowledgePoint[];
};

/** 服务端实际已导入、可用于可信诊断的课程目录项。 */
export type CourseCatalogEntry = {
  id: string;
  subject: string;
  textbookVersion: string;
  grade: number;
  semester: string;
  chapters: CourseChapter[];
};

/** 每日任务冻结的课程快照，任务进行中不会被后来改课覆盖。 */
export type CourseContextSnapshot = {
  courseId: string;
  subject: string;
  textbookVersion: string;
  grade: number;
  semester: string;
  chapterId: string;
  chapterTitle: string;
  knowledgePoints: CourseKnowledgePoint[];
};

export type StudentCourseContext = CourseContextSnapshot & {
  updatedAt: string;
};

export type CourseContextInput = {
  courseId: string;
  chapterId: string;
  knowledgePointIds: string[];
};

export type TodayTask = {
  id: string;
  subject: string;
  title: string;
  objective: string;
  learningHref: string;
  growthEarned: number;
  status: TodayTaskStatus;
  startedAt: string | null;
  completedAt: string | null;
  reflection: string | null;
  courseContext: CourseContextSnapshot | null;
};

export type TodayTasks = {
  taskDate: string;
  tasks: TodayTask[];
  growthEarned: number;
  courseContext: StudentCourseContext | null;
};

export type WorkspaceState = Record<string, Record<string, unknown>>;

export type WrongQuestionAnalysisStatus = "not_requested" | "completed";

export type WrongQuestion = {
  id: number;
  subject: string;
  questionText: string;
  knowledgePoints: string[];
  errorReason: string | null;
  analysisSummary: string | null;
  analysisStatus: WrongQuestionAnalysisStatus;
  hasImage: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WrongQuestionPage = {
  questions: WrongQuestion[];
  total: number;
  limit: number;
  offset: number;
};

export type WrongQuestionInput = {
  subject: string;
  question_text: string;
  knowledge_points: string[];
  error_reason?: string;
  source_upload_id?: string;
};

export type WrongQuestionUpload = {
  uploadId: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  createdAt: string;
};

export type OCRRecognition = {
  uploadId: string;
  questionText: string;
  formulas: string[];
  diagramDescription: string | null;
  modelName: string;
  latencyMs: number;
};

export type IntegrationCapabilityStatus = {
  enabled: boolean;
  configured: boolean;
  provider: string | null;
  model: string | null;
};

export type IntegrationStatus = {
  llm: IntegrationCapabilityStatus;
  ocr: IntegrationCapabilityStatus;
};

export type WrongQuestionAnalysis = {
  errorReason: string;
  knowledgePoints: string[];
  suggestion: string;
  modelName: string;
  latencyMs: number;
};

export type MathAnswerAttemptEvidence = {
  question_id: string;
  answer: unknown;
};

export type TaskCompletionEvidence =
  | { kind: "math_diagnosis"; attempts: MathAnswerAttemptEvidence[] }
  | { kind: "language_unit"; diagnosis_answers: Record<string, string>; answers: Record<string, string> }
  | { kind: "guided_activity"; answers: Record<string, string> };

export type LanguageProgressEntry = { task_id: string; last_studied_date: string; last_completed_at: string | null; completed_count: number };
export async function getLanguageProgress() {
  const result = await requestJson<{ units: LanguageProgressEntry[] }>("/api/student/language-progress");
  return result.units;
}

export class StudentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentApiError";
    this.status = status;
  }
}

/**
 * 当前标签页预期账号与 Cookie 中实际账号不一致。
 * 这通常发生在另一标签页刚刚切换账号时；外层会刷新真实会话，
 * 而不是让旧页面把内容写进新账号。
 */
export class SessionContextChangedError extends StudentApiError {
  constructor() {
    super("当前账号已在其他页面切换，正在刷新学习空间。", 409);
    this.name = "SessionContextChangedError";
  }
}

/** 新学生尚未选择服务器已导入的课程，不能拿本地演示任务替代。 */
export class CourseContextRequiredError extends StudentApiError {
  constructor(message = "请先选择今天要学习的课程内容。") {
    super(message, 409);
    this.name = "CourseContextRequiredError";
  }
}

/** 受保护请求发现会话失效时通知页面外层统一回到登录入口。 */
export const SESSION_EXPIRED_EVENT = "ai-coach-session-expired";
export type SessionExpiredDetail = { sessionEpoch: number };
export const SESSION_CONTEXT_CHANGED_EVENT = "ai-coach-session-context-changed";
export type SessionContextChangedDetail = { sessionEpoch: number };
export const EXPECTED_USER_ID_HEADER = "X-AI-Coach-Expected-User-Id";

/**
 * 图片元素无法自定义 Header，因此图片预览使用公开账号编号的同源查询参数。
 * 该编号不是令牌；BFF 会将它还原为预期账号头，服务端仍会进行所有权校验。
 */
export function buildProtectedImageUrl(path: string) {
  const expectedUserId = getExpectedSessionUserId();
  if (!expectedUserId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}expected_user_id=${encodeURIComponent(String(expectedUserId))}`;
}

export function notifySessionExpired(path: string, status: number, sessionEpoch = getSessionEpoch()) {
  if (status !== 401 || path.startsWith("/api/auth/")) return;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<SessionExpiredDetail>(SESSION_EXPIRED_EVENT, {
      detail: { sessionEpoch },
    }));
  }
}

export function notifySessionContextChanged(path: string, response: Response, sessionEpoch = getSessionEpoch()) {
  if (
    !isSessionContextChangedResponse(path, response)
    || typeof window === "undefined"
  ) return;
  window.dispatchEvent(new CustomEvent<SessionContextChangedDetail>(SESSION_CONTEXT_CHANGED_EVENT, {
    detail: { sessionEpoch },
  }));
}

type SameOriginRequestOptions = {
  /** 退出是有身份的写操作，需额外保留账号护栏。 */
  includeExpectedUserIdForAuth?: boolean;
};

/** 为所有浏览器请求固定同源凭据策略，避免令牌落入前端存储。 */
export function createSameOriginRequest(
  init: RequestInit = {},
  path = "",
  options: SameOriginRequestOptions = {},
): RequestInit {
  const headers = new Headers(init.headers);
  // auth/me 必须不带旧账号提示，才能在跨标签切换后发现最新 Cookie 对应的账号。
  // logout 是例外：它会改变服务端会话，仍须保护成“只退出我当前看到的账号”。
  const shouldAttachExpectedUser = !path.startsWith("/api/auth/") || options.includeExpectedUserIdForAuth;
  const expectedUserId = shouldAttachExpectedUser ? getExpectedSessionUserId() : null;
  if (expectedUserId) headers.set(EXPECTED_USER_ID_HEADER, String(expectedUserId));
  return {
    ...init,
    credentials: "same-origin",
    headers,
  };
}

function requestErrorMessage(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (status !== 422) return "服务暂时不可用，请稍后重试。";

  // 校验错误只使用白名单字段名，不能回显密码、密钥或校验器中的原始输入。
  const fields: Record<string, string> = {
    nickname: "称呼", grade: "年级", school_name: "学校", class_name: "班级",
    textbook: "教材", exam_score: "考试得分", exam_total: "考试满分",
    daily_minutes: "每日学习时间", username: "账号", password: "密码",
    display_name: "称呼", goal: "学习目标", weak_topics: "薄弱知识点",
  };
  const issues = Array.isArray(detail)
    ? detail.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
  if (issues.some(item => item.type === "extra_forbidden")) {
    return "提交字段与当前服务不匹配，请刷新页面；若仍失败，请联系管理员更新服务版本。";
  }
  const names = [...new Set(issues.flatMap(item => {
    const field = Array.isArray(item.loc) ? item.loc.at(-1) : undefined;
    return typeof field === "string" && Object.hasOwn(fields, field) ? [fields[field]] : [];
  }))].slice(0, 3);
  return names.length
    ? `提交的信息未通过校验，请检查并修改：${names.join("、")}。`
    : "提交的信息未通过校验，请检查填写内容后重试。";
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: SameOriginRequestOptions = {},
): Promise<T> {
  const requestSessionEpoch = getSessionEpoch();
  const response = await fetch(path, createSameOriginRequest(init, path, options));
  const body = await response.json().catch(() => ({})) as {
    detail?: unknown;
    course_context_required?: unknown;
  } & T;
  if (!response.ok) {
    notifySessionExpired(path, response.status, requestSessionEpoch);
    notifySessionContextChanged(path, response, requestSessionEpoch);
    if (isSessionContextChangedResponse(path, response)) {
      throw new SessionContextChangedError();
    }
    if (body.course_context_required === true) {
      throw new CourseContextRequiredError(
        typeof body.detail === "string" ? body.detail : undefined,
      );
    }
    throw new StudentApiError(
      requestErrorMessage(body.detail, response.status),
      response.status,
    );
  }
  return body;
}

function requireRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableText(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function asNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeCourseKnowledgePoint(value: unknown): CourseKnowledgePoint | null {
  const source = requireRecord(value);
  const id = asText(source.id);
  const title = asText(source.title);
  return id && title ? { id, title } : null;
}

function normalizeCourseContextSnapshot(value: unknown): CourseContextSnapshot | null {
  const source = requireRecord(value);
  const knowledgePoints = (Array.isArray(source.knowledge_points) ? source.knowledge_points : [])
    .map(normalizeCourseKnowledgePoint)
    .filter((point): point is CourseKnowledgePoint => point !== null);
  const grade = asPositiveInteger(source.grade);
  const courseId = asText(source.course_id);
  const chapterId = asText(source.chapter_id);
  if (!courseId || !chapterId || !knowledgePoints.length || !grade) return null;
  return {
    courseId,
    subject: asText(source.subject),
    textbookVersion: asText(source.textbook_version),
    grade,
    semester: asText(source.semester),
    chapterId,
    chapterTitle: asText(source.chapter_title),
    knowledgePoints,
  };
}

/** 读取当前账号已保存的课程选择；空值意味着尚未选择。 */
export function normalizeCourseContext(value: unknown): StudentCourseContext | null {
  const source = requireRecord(value);
  const snapshot = normalizeCourseContextSnapshot(source.context);
  if (!snapshot) return null;
  const updatedAt = asText(requireRecord(source.context).updated_at);
  return updatedAt ? { ...snapshot, updatedAt } : null;
}

/** 仅保留服务端登记且结构完整的教材、章节与知识点。 */
export function normalizeCourseCatalog(value: unknown): CourseCatalogEntry[] {
  const source = requireRecord(value);
  const rawCourses = Array.isArray(source.courses) ? source.courses : [];
  return rawCourses.map((item): CourseCatalogEntry | null => {
    const course = requireRecord(item);
    const chapters = (Array.isArray(course.chapters) ? course.chapters : []).map((chapter): CourseChapter | null => {
      const sourceChapter = requireRecord(chapter);
      const id = asText(sourceChapter.id);
      const title = asText(sourceChapter.title);
      const knowledgePoints = (Array.isArray(sourceChapter.knowledge_points) ? sourceChapter.knowledge_points : [])
        .map(normalizeCourseKnowledgePoint)
        .filter((point): point is CourseKnowledgePoint => point !== null);
      return id && title && knowledgePoints.length ? { id, title, knowledgePoints } : null;
    }).filter((chapter): chapter is CourseChapter => chapter !== null);
    const id = asText(course.id);
    const grade = asPositiveInteger(course.grade);
    return id && grade && chapters.length ? {
      id,
      subject: asText(course.subject),
      textbookVersion: asText(course.textbook_version),
      grade,
      semester: asText(course.semester),
      chapters,
    } : null;
  }).filter((course): course is CourseCatalogEntry => course !== null);
}

function asTaskStatus(value: unknown): TodayTaskStatus {
  return value === "completed" || value === "in_progress" ? value : "not_started";
}

/** 将后端 snake_case 数据转为学生界面可直接使用的稳定模型。 */
export function normalizeTodayTasks(value: unknown): TodayTasks {
  const source = requireRecord(value);
  const rawTasks = Array.isArray(source.tasks) ? source.tasks : [];
  const tasks = rawTasks.map((item): TodayTask => {
    const task = requireRecord(item);
    return {
      id: asText(task.id),
      subject: asText(task.subject),
      title: asText(task.title),
      objective: asText(task.objective),
      learningHref: asText(task.learning_href),
      growthEarned: typeof task.growth_earned === "number" ? task.growth_earned : 0,
      status: asTaskStatus(task.status),
      startedAt: asNullableText(task.started_at),
      completedAt: asNullableText(task.completed_at),
      reflection: asNullableText(task.reflection),
      courseContext: normalizeCourseContextSnapshot(task.course_context),
    };
  }).filter((task) => task.id && task.learningHref);

  return {
    taskDate: asText(source.task_date),
    tasks,
    growthEarned: typeof source.growth_earned === "number" ? source.growth_earned : 0,
    courseContext: normalizeCourseContext({ context: source.course_context }),
  };
}

function normalizeWrongQuestion(value: unknown): WrongQuestion | null {
  const source = requireRecord(value);
  const id = asPositiveInteger(source.id);
  const questionText = asText(source.question_text);
  if (!id || !questionText) return null;
  return {
    id,
    subject: asText(source.subject),
    questionText,
    knowledgePoints: asStringArray(source.knowledge_points),
    errorReason: asNullableText(source.error_reason),
    analysisSummary: asNullableText(source.analysis_summary),
    analysisStatus: source.analysis_status === "completed" ? "completed" : "not_requested",
    hasImage: source.has_image === true,
    createdAt: asText(source.created_at),
    updatedAt: asText(source.updated_at),
  };
}

/** 服务端永远只返回错题元数据，图片字节需另经受保护的同源 URL 读取。 */
export function normalizeWrongQuestions(value: unknown): WrongQuestion[] {
  const source = requireRecord(value);
  const rawQuestions = Array.isArray(source.questions) ? source.questions : [];
  return rawQuestions
    .map(normalizeWrongQuestion)
    .filter((question): question is WrongQuestion => question !== null);
}

/** 解析服务端错题分页信息，避免把默认首屏 50 条误认为全部记录。 */
export function normalizeWrongQuestionPage(value: unknown): WrongQuestionPage {
  const source = requireRecord(value);
  const questions = normalizeWrongQuestions(source);
  const offset = asNonNegativeInteger(source.offset);
  return {
    questions,
    total: Math.max(asNonNegativeInteger(source.total), offset + questions.length),
    limit: asPositiveInteger(source.limit) || questions.length || 50,
    offset,
  };
}

function normalizeIntegrationCapability(value: unknown): IntegrationCapabilityStatus {
  const source = requireRecord(value);
  return {
    enabled: source.enabled === true,
    configured: source.configured === true,
    provider: asNullableText(source.provider),
    model: asNullableText(source.model),
  };
}

/** 仅解析能力开关，客户端不接触 API Key 或其他敏感配置。 */
export function normalizeIntegrationStatus(value: unknown): IntegrationStatus {
  const source = requireRecord(value);
  return {
    llm: normalizeIntegrationCapability(source.llm),
    ocr: normalizeIntegrationCapability(source.ocr),
  };
}

function normalizeWrongQuestionUpload(value: unknown): WrongQuestionUpload {
  const source = requireRecord(value);
  const mediaType = asText(source.media_type);
  if (
    !asText(source.upload_id)
    || (mediaType !== "image/jpeg" && mediaType !== "image/png" && mediaType !== "image/webp")
    || !asPositiveInteger(source.size_bytes)
  ) {
    throw new StudentApiError("图片上传服务返回的数据不完整，请重新上传。", 502);
  }
  return {
    uploadId: asText(source.upload_id),
    mediaType,
    sizeBytes: asPositiveInteger(source.size_bytes),
    createdAt: asText(source.created_at),
  };
}

function normalizeOcrRecognition(value: unknown): OCRRecognition {
  const source = requireRecord(value);
  const uploadId = asText(source.upload_id);
  if (!uploadId) throw new StudentApiError("识别服务返回的数据不完整，请改为手动填写。", 502);
  return {
    uploadId,
    questionText: asText(source.question_text),
    formulas: asStringArray(source.formulas),
    diagramDescription: asNullableText(source.diagram_description),
    modelName: asText(source.model_name),
    latencyMs: typeof source.latency_ms === "number" && source.latency_ms >= 0 ? source.latency_ms : 0,
  };
}

function normalizeWrongQuestionAnalysis(value: unknown): WrongQuestionAnalysis {
  const source = requireRecord(value);
  return {
    errorReason: asText(source.error_reason),
    knowledgePoints: asStringArray(source.knowledge_points),
    suggestion: asText(source.suggestion),
    modelName: asText(source.model_name),
    latencyMs: typeof source.latency_ms === "number" && source.latency_ms >= 0 ? source.latency_ms : 0,
  };
}

/**
 * 服务端工作台采用按功能分桶的 JSON；只允许更新一个桶中的一个项目，
 * 便于数学、引导任务和互动课的草稿互不覆盖。
 */
export function getWorkspaceEntry<T>(state: WorkspaceState, bucket: string, key: string): T | null {
  const entry = state[bucket]?.[key];
  return entry === undefined ? null : entry as T;
}

export function setWorkspaceEntry<T>(
  state: WorkspaceState,
  bucket: string,
  key: string,
  value: T,
): WorkspaceState {
  return {
    ...state,
    [bucket]: {
      ...(state[bucket] ?? {}),
      [key]: value,
    },
  };
}

export function removeWorkspaceEntry(state: WorkspaceState, bucket: string, key: string): WorkspaceState {
  if (!state[bucket]?.[key]) return state;
  const { [key]: _removed, ...remaining } = state[bucket];
  return { ...state, [bucket]: remaining };
}

export async function getCurrentUser(signal?: AbortSignal) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/auth/me", { signal });
  return normalizeWorkspaceUser(result.user);
}

export async function bootstrapAdmin(input: {
  username: string;
  password: string;
  displayName: string;
  setupCode?: string;
}) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/auth/bootstrap", {
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      display_name: input.displayName,
      ...(input.setupCode ? { setup_code: input.setupCode } : {}),
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeWorkspaceUser(result.user);
}

export async function login(input: { username: string; password: string }) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/auth/login", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeWorkspaceUser(result.user);
}

export async function registerStudent(input: StudentRegistrationInput) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/auth/register", {
    body: JSON.stringify({ username: input.username, password: input.password, display_name: input.displayName, ...(input.grade ? { grade: input.grade } : {}) }),
    headers: { "Content-Type": "application/json" }, method: "POST",
  });
  return normalizeWorkspaceUser(result.user);
}

export async function getPersonalAIConfig(signal?: AbortSignal) {
  return normalizePersonalAIConfig(await requestJson<unknown>("/api/me/ai-config", { signal }));
}

export async function savePersonalAIConfig(kind: AIConfigKind, input: PersonalConfigUpdate) {
  return normalizePersonalAIConfig(await requestJson<unknown>(`/api/me/ai-config/${kind}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }));
}

export async function clearPersonalAIConfig(kind: AIConfigKind) {
  return normalizePersonalAIConfig(await requestJson<unknown>(`/api/me/ai-config/${kind}`, { method: "DELETE" }));
}

export async function logout() {
  await requestJson<{ detail: string }>(
    "/api/auth/logout",
    { method: "POST" },
    { includeExpectedUserIdForAuth: true },
  );
}

export async function getTodayTasks() {
  const result = normalizeTodayTasks(await requestJson<unknown>("/api/student/tasks/today"));
  // 旧语文英语行仍保留在服务端；页面只展示当前启用的学科。
  return { ...result, tasks: result.tasks.filter(task => isSubjectEnabled(task.subject)) };
}

export async function getCourseCatalog() {
  return normalizeCourseCatalog(await requestJson<unknown>("/api/student/course-catalog"));
}

export async function getCourseContext() {
  return normalizeCourseContext(await requestJson<unknown>("/api/student/course-context"));
}

/** 只提交稳定 ID；教材、章节名称和知识点标题由服务端重新回填。 */
export async function saveCourseContext(input: CourseContextInput) {
  const result = await requestJson<unknown>("/api/student/course-context", {
    body: JSON.stringify({
      course_id: input.courseId,
      chapter_id: input.chapterId,
      knowledge_point_ids: input.knowledgePointIds,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  const context = normalizeCourseContext(result);
  if (!context) throw new StudentApiError("课程选择服务返回的数据不完整，请重新选择。", 502);
  return context;
}

export async function startTodayTask(taskId: string) {
  const result = await requestJson<{ task: unknown }>(`/api/student/tasks/${encodeURIComponent(taskId)}/start`, {
    method: "POST",
  });
  return normalizeTodayTasks({ tasks: [result.task] }).tasks[0] ?? null;
}

export async function completeTodayTask(
  taskId: string,
  reflection: string,
  evidence: TaskCompletionEvidence,
) {
  const result = await requestJson<{ task: unknown; was_already_completed: boolean }>(
    `/api/student/tasks/${encodeURIComponent(taskId)}/complete`,
    {
      body: JSON.stringify({ reflection, evidence }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  return {
    task: normalizeTodayTasks({ tasks: [result.task] }).tasks[0] ?? null,
    wasAlreadyCompleted: result.was_already_completed,
  };
}

export async function getWorkspaceState() {
  const result = await requestJson<{ state: unknown }>("/api/student/workspace/state");
  const state = requireRecord(result.state);
  const buckets: WorkspaceState = {};
  for (const [bucket, entries] of Object.entries(state)) {
    if (entries && typeof entries === "object" && !Array.isArray(entries)) {
      buckets[bucket] = entries as Record<string, unknown>;
    }
  }
  return buckets;
}

export async function saveWorkspaceState(state: WorkspaceState) {
  const result = await requestJson<{ state: unknown }>("/api/student/workspace/state", {
    body: JSON.stringify({ state }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  return result.state;
}

export async function listTeacherStudents() {
  const result = await requestJson<{ students: CurrentWorkspaceUser[] }>("/api/teacher/students");
  return result.students.map(normalizeWorkspaceUser);
}

export async function createTeacherStudentsBatch(students: Array<{ username: string; displayName: string; password: string; grade?: string }>) {
  const result = await requestJson<{ students: CurrentWorkspaceUser[] }>("/api/teacher/students/batch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ students: students.map((student) => ({ username: student.username, display_name: student.displayName, password: student.password, grade: student.grade?.trim() || null })) }),
  });
  return result.students.map(normalizeWorkspaceUser);
}

export async function createTeacherStudent(input: {
  username: string;
  password: string;
  displayName: string;
  grade?: string;
}) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/teacher/students", {
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      display_name: input.displayName,
      grade: input.grade?.trim() || null,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return result.user;
}

export async function resetTeacherStudentPassword(studentId: number, password: string) {
  await requestJson<{ detail: string }>(`/api/teacher/students/${studentId}/reset-password`, {
    body: JSON.stringify({ password }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

/** 上传时直接传递 File 的原始 bytes，避免 Base64 和额外内存占用。 */
export async function uploadWrongQuestionImage(file: File) {
  const result = await requestJson<unknown>("/api/student/wrong-questions/uploads", {
    body: file,
    headers: { "Content-Type": file.type },
    method: "POST",
  });
  return normalizeWrongQuestionUpload(result);
}

/** 清理未关联到正式错题的暂存图片；已关联时后端会拒绝，调用方可安全忽略。 */
export async function deleteWrongQuestionUpload(uploadId: string) {
  await requestJson<{ detail: string }>(
    `/api/student/wrong-questions/uploads/${encodeURIComponent(uploadId)}`,
    { method: "DELETE" },
  );
}

export async function recognizeWrongQuestionImage(uploadId: string) {
  const result = await requestJson<unknown>("/api/student/ocr/recognize", {
    body: JSON.stringify({ upload_id: uploadId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  return normalizeOcrRecognition(result);
}

export async function getIntegrationStatus() {
  return normalizeIntegrationStatus(await requestJson<unknown>("/api/student/integrations"));
}

export async function listWrongQuestions({ limit = 50, offset = 0 }: { limit?: number; offset?: number } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
  const safeOffset = Math.max(0, Math.floor(offset));
  const query = new URLSearchParams({ limit: String(safeLimit), offset: String(safeOffset) });
  return normalizeWrongQuestionPage(
    await requestJson<unknown>(`/api/student/wrong-questions?${query.toString()}`),
  );
}

export async function getWrongQuestion(questionId: number) {
  const result = await requestJson<{ question: unknown }>(`/api/student/wrong-questions/${encodeURIComponent(String(questionId))}`);
  const question = normalizeWrongQuestion(result.question);
  if (!question || question.id !== questionId) throw new StudentApiError("错题内容暂时无法读取，请返回列表重试。", 502);
  return question;
}

export async function createWrongQuestion(input: WrongQuestionInput) {
  const result = await requestJson<{ question: unknown }>("/api/student/wrong-questions", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const question = normalizeWrongQuestion(result.question);
  if (!question) throw new StudentApiError("错题保存服务返回的数据不完整，请刷新后查看。", 502);
  return question;
}

export async function updateWrongQuestion(
  questionId: number,
  input: Partial<Pick<WrongQuestionInput, "subject" | "question_text" | "knowledge_points">> & {
    error_reason?: string | null;
  },
) {
  const result = await requestJson<{ question: unknown }>(
    `/api/student/wrong-questions/${encodeURIComponent(String(questionId))}`,
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
  );
  const question = normalizeWrongQuestion(result.question);
  if (!question) throw new StudentApiError("错题更新服务返回的数据不完整，请刷新后查看。", 502);
  return question;
}

export async function deleteWrongQuestion(questionId: number) {
  await requestJson<{ detail: string }>(
    `/api/student/wrong-questions/${encodeURIComponent(String(questionId))}`,
    { method: "DELETE" },
  );
}

export async function analyzeWrongQuestion(questionId: number) {
  const result = await requestJson<{ question: unknown; analysis: unknown }>(
    `/api/student/wrong-questions/${encodeURIComponent(String(questionId))}/analyze`,
    { method: "POST" },
  );
  const question = normalizeWrongQuestion(result.question);
  if (!question) throw new StudentApiError("分析服务返回的数据不完整，请刷新后查看。", 502);
  return { analysis: normalizeWrongQuestionAnalysis(result.analysis), question };
}
