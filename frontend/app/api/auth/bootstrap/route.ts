import { callBackend, createAuthenticatedResponse } from "../../_backend";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const response = await callBackend("/auth/bootstrap", {
      body: await request.text(),
      headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
      method: "POST",
    });
    return createAuthenticatedResponse(response);
  } catch {
    return NextResponse.json({ detail: "账户服务暂时无法连接，请稍后重试。" }, { status: 503 });
  }
}
