import { relayAuthenticatedRequest } from "../../../../_backend";

/** 学生主动请求后才执行 AI 错因分析，结果由后端写回该学生的错题。 */
export async function POST(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  return relayAuthenticatedRequest(
    request,
    `/wrong-questions/${encodeURIComponent(questionId)}/analyze`,
    "POST",
  );
}
