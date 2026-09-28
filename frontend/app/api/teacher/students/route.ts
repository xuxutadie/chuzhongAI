import { relayAuthenticatedRequest } from "../../_backend";

export async function GET(request: Request) {
  return relayAuthenticatedRequest(request, "/teacher/students", "GET");
}

export async function POST(request: Request) {
  return relayAuthenticatedRequest(request, "/teacher/students", "POST");
}
