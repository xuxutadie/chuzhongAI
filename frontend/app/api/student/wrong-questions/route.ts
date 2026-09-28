import { relayAuthenticatedRequest } from "../../_backend";

/** 错题列表和确认后的新记录均由服务端按当前学生隔离。 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const pageParams = new URLSearchParams();
  for (const name of ["limit", "offset"]) {
    const value = searchParams.get(name);
    if (value && /^\d+$/.test(value)) pageParams.set(name, value);
  }
  const query = pageParams.toString();
  return relayAuthenticatedRequest(request, `/wrong-questions${query ? `?${query}` : ""}`, "GET");
}

export async function POST(request: Request) {
  return relayAuthenticatedRequest(request, "/wrong-questions", "POST");
}
