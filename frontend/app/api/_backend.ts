import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isSameSiteRegistrationRequest } from "./server-request-origin";
import { forwardEducationHeaders } from '../education/route_rules';

export const SESSION_COOKIE_NAME = "ai_coach_session";
export const EXPECTED_USER_ID_HEADER = "X-AI-Coach-Expected-User-Id";
export const SESSION_CONTEXT_CHANGED_HEADER = "X-AI-Coach-Session-Context-Changed";
const MAX_AUTHENTICATED_JSON_BYTES = 1024 * 1024;

class RequestBodyTooLargeError extends Error {}
class InvalidRequestBodyLengthError extends Error {}

function getBackendOrigin() {
  const configured = process.env.BACKEND_API_ORIGIN?.trim();
  return (configured || "http://127.0.0.1:8000").replace(/\/$/, "");
}

export async function callBackend(
  path: string,
  init: RequestInit = {},
  accessToken?: string | null,
) {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${getBackendOrigin()}/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

async function getResponseBody(response: Response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { detail: `服务返回了异常响应（HTTP ${response.status}）` };
  }
}

/**
 * 所有同源 JSON 代理都在读取时限制大小，不能因缺少 Content-Length 而无界缓冲请求体。
 */
async function readBoundedRequestText(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new InvalidRequestBodyLengthError();
    }
    if (parsedLength > MAX_AUTHENTICATED_JSON_BYTES) {
      throw new RequestBodyTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_AUTHENTICATED_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function preserveRetryAfter(response: Response, nextResponse: NextResponse) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) nextResponse.headers.set("Retry-After", retryAfter);
}

export async function currentSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * 只接受正整数公开账号编号。该头不包含令牌；不合规值不转发，
 * 避免把任意客户端输入拼入上游认证上下文。
 */
export function getExpectedUserHeader(request: Request, allowQueryFallback = false) {
  const headerValue = request.headers.get(EXPECTED_USER_ID_HEADER)?.trim() ?? "";
  // <img> 不能附加自定义请求头；图片代理允许使用同样公开、非秘密的查询参数。
  // 仅二进制图片路径会开启该回退，普通 JSON API 仍只接受 header。
  const queryValue = allowQueryFallback
    ? new URL(request.url).searchParams.get("expected_user_id")?.trim() ?? ""
    : "";
  const value = headerValue || queryValue;
  return /^[1-9]\d*$/.test(value) ? value : null;
}

function withExpectedUserHeader(request: Request, headers?: HeadersInit, allowQueryFallback = false) {
  const forwarded = new Headers(headers);
  for (const [key,value] of forwardEducationHeaders(request,allowQueryFallback)) forwarded.set(key,value);
  const expectedUserId = getExpectedUserHeader(request, allowQueryFallback);
  if (expectedUserId) forwarded.set(EXPECTED_USER_ID_HEADER, expectedUserId);
  return { expectedUserId, headers: forwarded };
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: 12 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * 透传后端 JSON。
 * 不在通用 401 响应中清 Cookie：旧账号的慢请求可能在新账号登录后才返回，
 * 那时清除固定 Cookie 名会误删新账号会话。登录成功会覆盖 Cookie；退出则由后端撤销
 * 本次令牌，浏览器随后重新确认会话，不在迟到响应里直接删除固定 Cookie 名。
 */
export async function relayBackendResponse(response: Response) {
  const body = await getResponseBody(response);
  const nextResponse = NextResponse.json(body, { status: response.status });
  // 限流等待时间必须传给浏览器，便于页面明确提示何时可以重试。
  preserveRetryAfter(response, nextResponse);
  // 只有后端明确标记为“预期账号与实际账号不一致”才通知浏览器刷新会话。
  // 普通 409（例如未选课程、任务状态冲突）必须保留给对应页面自行处理。
  if (response.headers.get(SESSION_CONTEXT_CHANGED_HEADER) === "1") {
    nextResponse.headers.set(SESSION_CONTEXT_CHANGED_HEADER, "1");
  }
  return nextResponse;
}

export async function relayAuthenticatedRequest(request: Request, backendPath: string, method: string, timeoutMs = 15000) {
  const token = await currentSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  }

  try {
    const hasBody = method !== "GET" && method !== "HEAD";
    const { headers } = withExpectedUserHeader(
      request,
      hasBody ? { "Content-Type": request.headers.get("Content-Type") || "application/json" } : undefined,
    );
    const response = await callBackend(backendPath, {
      signal: AbortSignal.timeout(timeoutMs),
      body: hasBody ? await readBoundedRequestText(request) : undefined,
      headers,
      method,
    }, token);
    return relayBackendResponse(response);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ detail: "提交内容不能超过 1MB，请缩短后重试。" }, { status: 413 });
    }
    if (error instanceof InvalidRequestBodyLengthError) {
      return NextResponse.json({ detail: "提交内容大小信息无效，请重新提交。" }, { status: 400 });
    }
    return NextResponse.json({ detail: "学习服务暂时无法连接，请稍后重试。" }, { status: 503 });
  }
}

/**
 * 受保护图片资源不能经 JSON 转码，否则会损坏原始字节。
 * 该代理只转发后端响应流；浏览器端始终只携带同源 HttpOnly Cookie。
 */
export async function relayAuthenticatedBinaryRequest(request: Request, backendPath: string) {
  const token = await currentSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  }

  try {
    const { headers: upstreamHeaders } = withExpectedUserHeader(request, undefined, true);
    const response = await callBackend(backendPath, { headers: upstreamHeaders, method: "GET" }, token);
    if (!response.ok) return relayBackendResponse(response);

    const headers = new Headers();
    const contentType = response.headers.get("content-type");
    const contentLength = response.headers.get("content-length");
    if (contentType) headers.set("Content-Type", contentType);
    if (contentLength) headers.set("Content-Length", contentLength);
    const disposition = response.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new NextResponse(response.body, { headers, status: response.status });
  } catch {
    return NextResponse.json({ detail: "学习服务暂时无法连接，请稍后重试。" }, { status: 503 });
  }
}

/**
 * 用于不经过后端业务接口的同源资源（例如教材文件）。
 * 仅检查 Cookie 存在并不足够，过期会话也必须被后端确认并清除。
 */
export async function verifyAuthenticatedSession() {
  const token = await currentSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  }
  try {
    const response = await callBackend("/auth/me", { method: "GET" }, token);
    if (response.ok) return null;
    return relayBackendResponse(response);
  } catch {
    return NextResponse.json({ detail: "学习服务暂时无法连接，请稍后重试。" }, { status: 503 });
  }
}

export async function createAuthenticatedResponse(response: Response) {
  const body = await getResponseBody(response);
  if (!response.ok) {
    const nextResponse = NextResponse.json(body, { status: response.status });
    preserveRetryAfter(response, nextResponse);
    return nextResponse;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ detail: "登录服务返回格式不正确" }, { status: 502 });
  }
  const source = body as Record<string, unknown>;
  const accessToken = source.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    return NextResponse.json({ detail: "登录服务没有返回有效会话" }, { status: 502 });
  }
  const { access_token: _accessToken, token_type: _tokenType, expires_at: _expiresAt, ...publicBody } = source;
  const nextResponse = NextResponse.json(publicBody, { status: response.status });
  applySessionCookie(nextResponse, accessToken);
  return nextResponse;
}

/** 学生公开注册同样有流式大小限制；不接受跨站或非 JSON 表单注册。 */
export async function relayRegistrationRequest(request: Request, path: "/auth/register" | "/auth/register-teacher" = "/auth/register") {
  if (!isSameSiteRegistrationRequest(request)) {
    return NextResponse.json({ detail: "请从本站的学生注册页面提交。" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ detail: "注册信息必须使用 JSON 格式。" }, { status: 415 });
  }
  try {
    const response = await callBackend(path, {
      body: await readBoundedRequestText(request), headers: { "Content-Type": "application/json" }, method: "POST",
    });
    return createAuthenticatedResponse(response);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ detail: "注册信息过大，请缩短后重试。" }, { status: 413 });
    if (error instanceof InvalidRequestBodyLengthError) return NextResponse.json({ detail: "注册信息大小无效，请重新提交。" }, { status: 400 });
    return NextResponse.json({ detail: "账户服务暂时无法连接，请稍后重试。" }, { status: 503 });
  }
}
