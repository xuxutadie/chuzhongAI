import type { MathLearningSession, QuestionAttempt } from "./math-learning/types";
import type { MathAnswerAttemptEvidence } from "./student-api";

type MathEvidenceSession = Pick<MathLearningSession, "phase" | "selectedKnowledgePointIds" | "answers">;

/**
 * 服务端会重新判分，因此前端只提交每个知识点最后一轮真正通过的作答。
 * 首测失败后的旧作答、无效图形题和重复题号都不能混入完成凭据。
 */
export function buildMathCompletionAttempts(session: MathEvidenceSession): MathAnswerAttemptEvidence[] {
  if (session.phase !== "passed") return [];

  const result: MathAnswerAttemptEvidence[] = [];
  const submittedQuestionIds = new Set<string>();

  for (const knowledgePointId of session.selectedKnowledgePointIds) {
    const knowledgePointAttempts = session.answers.filter(
      (attempt) => attempt.knowledgePointId === knowledgePointId,
    );
    const rounds = [...new Set(knowledgePointAttempts.map((attempt) => attempt.round))].sort((left, right) => right - left);
    const finalPassedRound = rounds.find((round) => {
      const attempts = knowledgePointAttempts.filter((attempt) => attempt.round === round);
      return attempts.length > 0 && attempts.every((attempt) => attempt.valid && attempt.correct);
    });
    if (finalPassedRound === undefined) return [];

    const finalAttemptsByQuestionId = new Map<string, QuestionAttempt>();
    for (const attempt of knowledgePointAttempts) {
      if (attempt.round === finalPassedRound) {
        finalAttemptsByQuestionId.set(attempt.questionId, attempt);
      }
    }
    for (const attempt of finalAttemptsByQuestionId.values()) {
      // 未经服务端登记的 AI 变式题没有可信答案，不能伪装为可完成的证据。
      if (attempt.questionId.startsWith("ai-")) return [];
      if (!attempt.valid || !attempt.correct || submittedQuestionIds.has(attempt.questionId)) continue;
      submittedQuestionIds.add(attempt.questionId);
      result.push({ question_id: attempt.questionId, answer: attempt.answer });
    }
  }

  return result;
}
