export type WrongQuestionSubject = "数学" | "英语" | "语文";

export type WrongQuestionDraft = {
  subject: WrongQuestionSubject;
  questionText: string;
  knowledgePointsText: string;
  errorReason: string;
  sourceUploadId?: string;
};

export type WrongQuestionPayload = {
  subject: string;
  question_text: string;
  knowledge_points: string[];
  error_reason?: string;
  source_upload_id?: string;
};

export const MAX_WRONG_QUESTION_IMAGE_BYTES: number;
export const ALLOWED_WRONG_QUESTION_IMAGE_TYPES: string[];
export function validateWrongQuestionFile(file: Pick<File, "type" | "size"> | undefined): string;
export function splitKnowledgePoints(value: string): string[];
export function validateWrongQuestionDraft(draft: Pick<WrongQuestionDraft, "questionText">): string;
export function buildWrongQuestionPayload(draft: WrongQuestionDraft): WrongQuestionPayload;
export function getWrongQuestionImagePath(questionId: string | number): string;
