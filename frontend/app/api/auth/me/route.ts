import { relayAuthenticatedRequest } from "../../_backend";

export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/auth/me", "GET");
}
