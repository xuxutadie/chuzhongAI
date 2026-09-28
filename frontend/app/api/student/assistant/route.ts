import { relayAuthenticatedRequest } from "../../_backend";

/** 学生答疑统一经由同源 BFF，浏览器从不接触模型密钥或后端令牌。 */
export async function POST(request: Request) {
  return relayAuthenticatedRequest(request, "/assistant", "POST");
}
