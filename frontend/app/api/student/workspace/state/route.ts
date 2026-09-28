import { relayAuthenticatedRequest } from "../../../_backend";

export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/workspace/state", "GET");
}

export async function PUT(request: Request) {
  return relayAuthenticatedRequest(request, "/workspace/state", "PUT");
}
