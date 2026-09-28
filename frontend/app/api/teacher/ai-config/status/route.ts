import { relayAuthenticatedRequest } from "../../../_backend";

/** 教师只读取是否已配置，不返回 API Key、Secret 或服务端地址。 */
export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/teacher/ai-config/status", "GET");
}
