import { relayAuthenticatedRequest } from "../../../../_backend";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return relayAuthenticatedRequest(request, `/me/tasks/${encodeURIComponent(taskId)}/complete`, "POST");
}
