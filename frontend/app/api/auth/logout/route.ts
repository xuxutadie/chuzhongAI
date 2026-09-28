import { NextResponse } from "next/server";

import {
  callBackend,
  currentSessionToken,
  EXPECTED_USER_ID_HEADER,
  getExpectedUserHeader,
  relayBackendResponse,
} from "../../_backend";

export async function POST(request: Request) {
  const token = await currentSessionToken();
  if (!token) {
    return NextResponse.json({ detail: "已退出登录" });
  }
  const expectedUserId = getExpectedUserHeader(request);
  try {
    const backendResponse = await callBackend("/auth/logout", {
      headers: expectedUserId ? { [EXPECTED_USER_ID_HEADER]: expectedUserId } : undefined,
      method: "POST",
    }, token);
    // 不能在此处清理固定 Cookie：A 的迟到退出响应可能已被 B 的登录覆盖。
    // 后端成功时已撤销“这次请求携带的 A 令牌”，客户端随后会重新确认 Cookie。
    return relayBackendResponse(backendResponse);
  } catch {
    return NextResponse.json({ detail: "账号服务暂时无法连接，请稍后重新确认登录状态。" }, { status: 503 });
  }
}
