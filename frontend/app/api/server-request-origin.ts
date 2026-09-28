/** 注册来源校验，独立于 Next 便于用真实 Request 做回归测试。 */
export function isSameSiteRegistrationRequest(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  // 无 Origin 的非浏览器 JSON 客户端保持兼容；浏览器提供的 null Origin 必须拒绝。
  if (origin === null) return true;
  try {
    const source = new URL(origin);
    if (!["http:", "https:"].includes(source.protocol) || source.origin !== origin) return false;
    // Next 内部 URL 可能是 localhost/http；真实 Host 保留浏览器访问的域名和端口。
    // 不读取 X-Forwarded-Host，避免不受信任的转发头改变校验对象。
    const requestHost = request.headers.get("host") ?? new URL(request.url).host;
    if (!requestHost || /[\s,\/\\?#@]/.test(requestHost)) return false;
    const target = new URL(`${source.protocol}//${requestHost}`);
    return source.host === target.host;
  } catch {
    return false;
  }
}
