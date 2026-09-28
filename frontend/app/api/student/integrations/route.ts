import { relayAuthenticatedRequest } from "../../_backend";

/** 只返回 OCR/LLM 是否可用，不返回任何密钥或配置正文。 */
export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/me/integrations", "GET");
}
