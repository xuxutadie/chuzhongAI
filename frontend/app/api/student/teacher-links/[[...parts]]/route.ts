import { NextResponse } from "next/server";
import { relayAuthenticatedRequest } from "../../../_backend";
async function proxy(request: Request, context: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await context.params;
  const path = parts.join("/");
  const rules: Record<string, RegExp> = { GET: /^$/, POST: /^code$/, DELETE: /^\d+$/ };
  if (!rules[request.method]?.test(path)) return NextResponse.json({ detail: "无效的师生关联路径" }, { status: 404 });
  const response = await relayAuthenticatedRequest(request, `/me/teacher-links${path ? `/${path}` : ""}`, request.method);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
