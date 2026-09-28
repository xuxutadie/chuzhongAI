/**
 * 浏览器内的会话代次。
 * 网络请求在发起时记录当前值；账号切换、退出或会话失效都会推进代次，
 * 因而旧请求迟到的 401 不会误影响新账号。
 */
let currentSessionEpoch = 0;
// 这不是令牌，也不会写入 localStorage。它只描述当前标签页认为自己正在使用的账号，
// 用于让后端拒绝“旧页面 + 新 Cookie”造成的跨账号写入。
let expectedSessionUserId = null;

export function advanceSessionEpoch() {
  currentSessionEpoch += 1;
  return currentSessionEpoch;
}

export function getSessionEpoch() {
  return currentSessionEpoch;
}

export function isCurrentSessionEpoch(epoch) {
  return epoch === currentSessionEpoch;
}

export function setExpectedSessionUserId(userId) {
  expectedSessionUserId = Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function getExpectedSessionUserId() {
  return expectedSessionUserId;
}

export function clearExpectedSessionUserId() {
  expectedSessionUserId = null;
}
