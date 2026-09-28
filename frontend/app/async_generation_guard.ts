/**
 * 为同一页面中的异步请求分配递增版本。
 * 当账号切换、登出或发起新的刷新时，旧请求即使晚到也不允许再提交状态。
 */
export function createRequestGeneration() {
  let currentGeneration = 0;

  return {
    advance() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent(generation: number) {
      return generation === currentGeneration;
    },
    current() {
      return currentGeneration;
    },
  };
}
