/**
 * 只同步“会话发生变化”这一非秘密信号，绝不广播 Cookie、令牌、账号资料或请求内容。
 * BroadcastChannel 不可用时使用 storage event 作为兼容回退。
 */
const SESSION_SYNC_STORAGE_KEY = "ai-coach-session-change";
const sessionTabId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).slice(2)}`;
const deliveredEventIds = new Set();

function parseChange(value) {
  if (!value || typeof value !== "object") return null;
  const candidate = value;
  if (
    typeof candidate.id !== "string"
    || typeof candidate.source !== "string"
    || (candidate.kind !== "signed-in" && candidate.kind !== "signed-out" && candidate.kind !== "expired")
  ) return null;
  return candidate;
}

function remember(change) {
  if (deliveredEventIds.has(change.id)) return false;
  deliveredEventIds.add(change.id);
  // 仅保留很小的去重窗口，避免长期页面累积状态。
  if (deliveredEventIds.size > 32) {
    const oldest = deliveredEventIds.values().next().value;
    if (oldest) deliveredEventIds.delete(oldest);
  }
  return true;
}

export function publishSessionChange(kind) {
  if (typeof window === "undefined") return;
  const change = {
    id: `${sessionTabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind,
    source: sessionTabId,
  };
  remember(change);

  try {
    if (typeof window.BroadcastChannel === "function") {
      const channel = new window.BroadcastChannel(SESSION_SYNC_STORAGE_KEY);
      channel.postMessage(change);
      channel.close();
    }
  } catch {
    // 仍会尝试 storage event；两者都不可用时同标签会话逻辑仍然安全。
  }
  try {
    window.localStorage.setItem(SESSION_SYNC_STORAGE_KEY, JSON.stringify(change));
    window.localStorage.removeItem(SESSION_SYNC_STORAGE_KEY);
  } catch {
    // 私密浏览模式可能禁用本地存储，不影响当前标签的正常会话流程。
  }
}

export function subscribeToSessionChanges(onChange) {
  if (typeof window === "undefined") return () => {};

  const receive = (raw) => {
    const change = parseChange(raw);
    if (!change || change.source === sessionTabId || !remember(change)) return;
    onChange(change.kind);
  };

  const handleStorage = (event) => {
    if (event.key !== SESSION_SYNC_STORAGE_KEY || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // 非本系统或损坏的 storage 值不能影响会话状态。
    }
  };

  let channel = null;
  try {
    if (typeof window.BroadcastChannel === "function") {
      channel = new window.BroadcastChannel(SESSION_SYNC_STORAGE_KEY);
      channel.addEventListener("message", (event) => receive(event.data));
    }
  } catch {
    channel = null;
  }
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
    channel?.close();
  };
}
