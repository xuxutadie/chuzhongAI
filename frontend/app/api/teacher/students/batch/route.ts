import { relayAuthenticatedRequest } from "../../../_backend";

export async function POST(request: Request) {
  return relayAuthenticatedRequest(request, "/teacher/students/batch", "POST");
}
