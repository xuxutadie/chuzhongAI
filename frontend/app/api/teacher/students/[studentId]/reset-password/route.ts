import { relayAuthenticatedRequest } from "../../../../_backend";

export async function POST(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  if (!/^\d+$/.test(studentId)) {
    return Response.json({ detail: "学生编号格式不正确" }, { status: 400 });
  }
  return relayAuthenticatedRequest(request, `/teacher/students/${studentId}/reset-password`, "POST");
}
