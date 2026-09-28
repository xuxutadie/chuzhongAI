export const LANGUAGE_DRAFT_SYNC_DELAY_MS = 650;

/**
 * 返回取消函数，供 React Effect 在下一次输入前撤销旧同步。
 * 本机草稿由调用方立即保存，这里只控制服务器同步频率。
 */
export function scheduleLanguageDraftSync(sync: () => void) {
  const timer = globalThis.setTimeout(sync, LANGUAGE_DRAFT_SYNC_DELAY_MS);
  return () => globalThis.clearTimeout(timer);
}
