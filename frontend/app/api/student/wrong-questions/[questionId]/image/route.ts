import { relayAuthenticatedBinaryRequest } from "../../../../_backend";

/** 已保存错题图片只经同源 BFF 返回，避免公开媒体链接。 */
export async function GET(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  return relayAuthenticatedBinaryRequest(request, `/wrong-questions/${encodeURIComponent(questionId)}/image`);
}
