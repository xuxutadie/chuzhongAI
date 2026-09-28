import { answerLabel, interview, type ProfileFields } from "./model.ts";

// 仅使用服务器已确认的回答；保存失败时不把输入伪装成已发送消息。
export function buildChatTurns(fields: ProfileFields, questions: Record<string, string> = {}) {
  return [...new Set(fields.answered_fields)].flatMap(field => {
    const row = interview.find(item => item.field === field);
    return row ? [{ field, question: questions[field] || row.question, answer: answerLabel(fields, field) }] : [];
  });
}
