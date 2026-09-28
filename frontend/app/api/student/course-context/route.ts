import { relayAuthenticatedRequest } from "../../_backend";

/** 当前学生的课程选择必须经会话和所有权校验后保存。 */
export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/me/course-context", "GET");
}

export async function PUT(request: Request) {
  return relayAuthenticatedRequest(request, "/me/course-context", "PUT");
}
