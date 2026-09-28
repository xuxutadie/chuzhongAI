import { NextResponse } from "next/server";
import { relayAuthenticatedRequest } from "../../../_backend";

type Context = { params: Promise<{ kind: string }> };
async function relay(request: Request, context: Context, method: "PUT" | "DELETE") {
  const { kind } = await context.params;
  if (kind !== "llm" && kind !== "ocr") return NextResponse.json({ detail: "未知的 AI 能力。" }, { status: 404 });
  return relayAuthenticatedRequest(request, `/me/ai-config/${kind}`, method);
}
export async function PUT(request: Request, context: Context) { return relay(request, context, "PUT"); }
export async function DELETE(request: Request, context: Context) { return relay(request, context, "DELETE"); }
