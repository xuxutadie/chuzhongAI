import { NextResponse } from "next/server";
import { relayAuthenticatedBinaryRequest, relayAuthenticatedRequest } from "../../_backend";

// 白名单只允许诊断路径，不允许把代理变成任意后端请求通道。
async function proxy(request: Request, context: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await context.params;
  const path = parts.join("/");
  const uuid = "[0-9a-f-]{36}";
  const rules: Record<string, RegExp> = {
    GET: new RegExp(`^(|attempts/${uuid}(/pdf)?)$`),
    PUT: new RegExp(`^(profile|attempts/${uuid}/answers)$`),
    PATCH: /^profile\/school$/,
    POST: new RegExp(`^(question|attempts|attempts/${uuid}/(submit|interpret))$`),
  };
  if (!rules[request.method]?.test(path)) return NextResponse.json({ detail: "无效的诊断路径" }, { status: 404 });
  const backend = `/me/diagnosis${path ? `/${path}` : ""}`;
  const response = path.endsWith("/pdf")
    ? await relayAuthenticatedBinaryRequest(request, backend)
    : await relayAuthenticatedRequest(request, backend, request.method, path === "question" || path.endsWith("/interpret") ? 90000 : 15000);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = proxy;
export const PUT = proxy;
export const POST = proxy;
export const PATCH = proxy;
