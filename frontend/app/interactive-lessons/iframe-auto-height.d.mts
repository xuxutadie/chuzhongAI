export function measureIframeContentHeight(frameDocument: Document): number;

export function observeIframeAutoHeight(
  frame: HTMLIFrameElement,
  onHeightChange: (height: number) => void,
): () => void;
