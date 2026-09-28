import { NextResponse } from "next/server";
import { relayAuthenticatedRequest, relayAuthenticatedBinaryRequest } from "../../../_backend";

async function proxy(request: Request, context: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await context.params;
  const path = parts.join("/");
  const rules: Record<string, RegExp> = {
    GET: /^(profile|linked-students|linked-students\/\d+(\/(history|assessments\/[0-9a-f-]{36}(\/pdf)?|wrong-questions\/\d+(\/image)?))?)$/,
    POST: /^claims$/, PUT: /^profile$/, DELETE: /^links\/\d+$/,
  };
  if (!rules[request.method]?.test(path)) return NextResponse.json({ detail: "无效的教师功能路径" }, { status: 404 });
  const url = new URL(request.url);
  const query = new URLSearchParams();
  for (const key of ["offset", "limit", "school", "class_name", "grade", "name", "kind"]) {
    const value = url.searchParams.get(key);
    if (value !== null) query.set(key, value);
  }
  const backend = `/teacher/${path}${query.size ? `?${query}` : ""}`;
  const response = /\/(pdf|image)$/.test(path)
    ? await relayAuthenticatedBinaryRequest(request, backend)
    : await relayAuthenticatedRequest(request, backend, request.method);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
