import { relayAuthenticatedRequest } from "../../_backend";

/** 只返回服务端已导入、可真实学习的课程目录。 */
export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/me/course-catalog", "GET");
}
