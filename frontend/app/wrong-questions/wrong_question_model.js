/**
 * 错题集的纯前端校验与数据整理。
 * 图片和错题记录均由服务端保存，浏览器只保留短生命周期的预览地址。
 */

export const MAX_WRONG_QUESTION_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_WRONG_QUESTION_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function validateWrongQuestionFile(file) {
  if (!file || !ALLOWED_WRONG_QUESTION_IMAGE_TYPES.includes(file.type)) {
    return "请选择 JPG、PNG 或 WebP 图片。";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "图片文件无效，请重新选择。";
  }
  if (file.size > MAX_WRONG_QUESTION_IMAGE_BYTES) {
    return "图片不能超过 5MB，请裁剪题目区域后重试。";
  }
  return "";
}

/** 将输入框中的逗号、中文逗号、顿号和换行统一为去重知识点数组。 */
export function splitKnowledgePoints(value) {
  const seen = new Set();
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter((item) => item && !seen.has(item) && seen.add(item))
    .slice(0, 20);
}

export function validateWrongQuestionDraft(draft) {
  if (!draft.questionText?.trim()) {
    return "请先确认或填写题目文字，再保存到错题集。";
  }
  return "";
}

/** 生成与后端契约一致的负载，绝不携带 Base64 或浏览器本地记录。 */
export function buildWrongQuestionPayload(draft) {
  const payload = {
    subject: draft.subject.trim(),
    question_text: draft.questionText.trim(),
    knowledge_points: splitKnowledgePoints(draft.knowledgePointsText),
  };
  const errorReason = draft.errorReason?.trim();
  const sourceUploadId = draft.sourceUploadId?.trim();
  if (errorReason) payload.error_reason = errorReason;
  if (sourceUploadId) payload.source_upload_id = sourceUploadId;
  return payload;
}

/** 图片经同源 BFF 读取，浏览器不会获得后端会话令牌。 */
export function getWrongQuestionImagePath(questionId) {
  return `/api/student/wrong-questions/${encodeURIComponent(String(questionId))}/image`;
}
