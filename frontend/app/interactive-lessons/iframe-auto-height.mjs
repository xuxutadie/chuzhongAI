const HEIGHT_TOLERANCE = 2;

/**
 * 读取课件真实内容高度，避免 body 的 min-height: 100vh 把旧的 iframe 高度误当成内容高度。
 *
 * @param {Document} frameDocument
 * @returns {number}
 */
export function measureIframeContentHeight(frameDocument) {
  const root = frameDocument.documentElement;
  const body = frameDocument.body;
  if (!root || !body) return 0;

  const frameWindow = frameDocument.defaultView;
  const scrollY = frameWindow?.scrollY ?? 0;
  const viewportHeight = root.clientHeight;
  const reportedScrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
  const bodyStyles = frameWindow?.getComputedStyle(body);
  const bodyPaddingBottom = Number.parseFloat(bodyStyles?.paddingBottom ?? "0") || 0;
  const bodyTop = body.getBoundingClientRect().top + scrollY;

  let contentBottom = bodyTop;
  for (const child of body.children) {
    const styles = frameWindow?.getComputedStyle(child);
    if (styles?.display === "none" || styles?.position === "fixed") continue;
    const rect = child.getBoundingClientRect();
    // 末尾块的正下外边距不会计入 getBoundingClientRect()，漏掉后会让高度在
    // “无滚动”和“差一个 margin”之间反复切换。
    const marginBottom = Math.max(0, Number.parseFloat(styles?.marginBottom ?? "0") || 0);
    contentBottom = Math.max(contentBottom, rect.bottom + scrollY + marginBottom);
  }

  const naturalContentHeight = Math.max(0, contentBottom - bodyTop + bodyPaddingBottom);
  const overflowingContentHeight = reportedScrollHeight > viewportHeight + HEIGHT_TOLERANCE
    ? reportedScrollHeight
    : 0;

  return Math.ceil(Math.max(naturalContentHeight, overflowingContentHeight));
}

/**
 * 监听同源 iframe 的尺寸和内容变化，并把真实内容高度交给父页面。
 * 跨域或暂未加载时会静默跳过，保留 CSS 的默认高度作为降级方案。
 *
 * @param {HTMLIFrameElement} frame
 * @param {(height: number) => void} onHeightChange
 * @returns {() => void}
 */
export function observeIframeAutoHeight(frame, onHeightChange) {
  let disconnectDocumentObservers = () => {};
  let isDisposed = false;

  const connectToDocument = () => {
    disconnectDocumentObservers();

    let frameDocument;
    let frameWindow;
    try {
      frameDocument = frame.contentDocument;
      frameWindow = frame.contentWindow;
    } catch {
      return;
    }
    if (!frameDocument || !frameWindow) return;

    let animationFrameId = 0;
    let isConnectionDisposed = false;
    const syncHeight = () => {
      animationFrameId = 0;
      if (isDisposed || isConnectionDisposed) return;
      const measuredHeight = measureIframeContentHeight(frameDocument);
      if (measuredHeight > 0) onHeightChange(measuredHeight);
    };
    const scheduleSync = () => {
      if (isDisposed || isConnectionDisposed) return;
      try {
        if (animationFrameId) frameWindow.cancelAnimationFrame(animationFrameId);
        animationFrameId = frameWindow.requestAnimationFrame(syncHeight);
      } catch {
        // iframe 已切换到跨域文档时，旧 WindowProxy 不再允许访问。
        animationFrameId = 0;
      }
    };

    const resizeObserver = "ResizeObserver" in frameWindow
      ? new frameWindow.ResizeObserver(scheduleSync)
      : null;
    if (resizeObserver) {
      resizeObserver.observe(frameDocument.documentElement);
      if (frameDocument.body) resizeObserver.observe(frameDocument.body);
    }

    const mutationObserver = "MutationObserver" in frameWindow
      ? new frameWindow.MutationObserver(scheduleSync)
      : null;
    mutationObserver?.observe(frameDocument.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    frameWindow.addEventListener("resize", scheduleSync);
    frameDocument.fonts?.ready.then(scheduleSync).catch(() => {});
    scheduleSync();

    disconnectDocumentObservers = () => {
      if (isConnectionDisposed) return;
      isConnectionDisposed = true;
      try {
        if (animationFrameId) frameWindow.cancelAnimationFrame(animationFrameId);
      } catch {
        // 跨域导航会自动销毁旧文档，只需避免清理过程向父页面抛错。
      }
      animationFrameId = 0;
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      try {
        frameWindow.removeEventListener("resize", scheduleSync);
      } catch {
        // 同上：旧窗口已经不可访问，不需要继续主动移除监听。
      }
    };
  };

  frame.addEventListener("load", connectToDocument);
  try {
    if (frame.contentDocument?.readyState === "complete") connectToDocument();
  } catch {
    // iframe 初始即为跨域地址时保留 CSS 默认高度。
  }

  return () => {
    isDisposed = true;
    frame.removeEventListener("load", connectToDocument);
    disconnectDocumentObservers();
  };
}
