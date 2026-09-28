import { relayAuthenticatedBinaryRequest } from "../../../../../_backend";

/** 上传后、确认前的图片预览也必须经登录态和所有权校验。 */
export async function GET(request: Request, { params }: { params: Promise<{ uploadId: string }> }) {
  const { uploadId } = await params;
  return relayAuthenticatedBinaryRequest(
    request,
    `/wrong-questions/uploads/${encodeURIComponent(uploadId)}/image`,
  );
}
