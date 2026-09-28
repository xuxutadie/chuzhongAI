import { relayAuthenticatedRequest } from "../../../../_backend";

/** 未确认并关联到错题集的暂存图片可由上传者主动清理。 */
export async function DELETE(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  return relayAuthenticatedRequest(
    request,
    `/wrong-questions/uploads/${encodeURIComponent(uploadId)}`,
    "DELETE",
  );
}
