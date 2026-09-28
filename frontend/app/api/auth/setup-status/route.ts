import { NextResponse } from "next/server";
import { callBackend, relayBackendResponse } from "../../_backend";
export async function GET() {
  try { return relayBackendResponse(await callBackend("/auth/setup-status")); }
  catch { return NextResponse.json({ setup_required: false }, { status: 503 }); }
}
