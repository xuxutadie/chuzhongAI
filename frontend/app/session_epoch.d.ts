/** 浏览器会话版本，防止旧请求迟到后影响新登录账号。 */
export function advanceSessionEpoch(): number;
export function getSessionEpoch(): number;
export function isCurrentSessionEpoch(epoch: number): boolean;
/** 当前标签页预期的公开用户编号；绝不包含 Cookie 或令牌。 */
export function setExpectedSessionUserId(userId: number | null | undefined): void;
export function getExpectedSessionUserId(): number | null;
export function clearExpectedSessionUserId(): void;
