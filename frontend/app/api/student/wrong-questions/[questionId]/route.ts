import { relayAuthenticatedRequest } from "../../../_backend";

function getBackendPath(questionId: string) {
  return `/wrong-questions/${encodeURIComponent(questionId)}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  return relayAuthenticatedRequest(request, getBackendPath(questionId), "GET");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  return relayAuthenticatedRequest(request, getBackendPath(questionId), "PATCH");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  return relayAuthenticatedRequest(request, getBackendPath(questionId), "DELETE");
}
