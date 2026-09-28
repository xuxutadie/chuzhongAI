/**
 * 后端只会在“预期账号与当前 Cookie 账号不一致”时附带该响应头。
 * 普通 409（未选课程、任务顺序、上传冲突）必须继续由所在页面处理。
 */
export const SESSION_CONTEXT_CHANGED_HEADER = "X-AI-Coach-Session-Context-Changed";

export function isSessionContextChangedResponse(path, response) {
  return !path.startsWith("/api/auth/")
    && response.headers.get(SESSION_CONTEXT_CHANGED_HEADER) === "1";
}
