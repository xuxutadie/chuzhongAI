import { relayRegistrationRequest } from "../../_backend";

export async function POST(request: Request) {
  return relayRegistrationRequest(request);
}
