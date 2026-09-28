import type { MathKnowledgePackage, QuestionAttempt } from "./types";

/** 独立过关题不依赖 AI，也不能混入未登记题号。第一章仍兼容原题重测。 */
export function getRoundQuestions(pack: MathKnowledgePackage, round: number) {
  return round > 1 && pack.retestQuestions?.length ? pack.retestQuestions : pack.questions;
}

/** 只讲解当前轮真正做错的题；第二轮错题也能在过关题库中找到原题。 */
export function getReviewQuestions(pack: MathKnowledgePackage, attempts: QuestionAttempt[]) {
  const wrongIds = new Set(attempts.filter((attempt) => !attempt.correct || !attempt.valid)
    .map((attempt) => attempt.questionId.replace(/-text-fallback$/, "")));
  return [...pack.questions, ...(pack.retestQuestions ?? [])].filter((question) => wrongIds.has(question.id));
}
