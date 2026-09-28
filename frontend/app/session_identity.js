/**
 * 与会话代次共用同一份内存状态。保留这个轻量入口是为了让调用方语义清晰，
 * 并避免在多个模块中各自保存一份可能不同步的“预期账号”。
 */
export {
  clearExpectedSessionUserId,
  getExpectedSessionUserId,
  setExpectedSessionUserId,
} from "./session_epoch.js";
