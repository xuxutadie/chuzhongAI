"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  getCurrentUser,
  logout as requestLogout,
  SESSION_CONTEXT_CHANGED_EVENT,
  SESSION_EXPIRED_EVENT,
  type SessionContextChangedDetail,
  type SessionExpiredDetail,
  type CurrentWorkspaceUser,
  StudentApiError,
} from "../student-api";
import { createRequestGeneration } from "../async_generation_guard";
import {
  advanceSessionEpoch,
  clearExpectedSessionUserId,
  isCurrentSessionEpoch,
  setExpectedSessionUserId,
} from "../session_epoch.js";
import { publishSessionChange, subscribeToSessionChanges } from "../session_sync.js";

type SessionStatus = "loading" | "authenticated" | "anonymous";
type RefreshOutcome = "idle" | "authenticated" | "anonymous" | "failed";

type StudentSessionContextValue = {
  user: CurrentWorkspaceUser | null;
  status: SessionStatus;
  error: string | null;
  refreshSession: () => Promise<CurrentWorkspaceUser | null>;
  setAuthenticatedUser: (user: CurrentWorkspaceUser) => void;
  /** 仅在重新确认后没有当前会话时返回 true。 */
  logout: () => Promise<boolean>;
};

const StudentSessionContext = createContext<StudentSessionContextValue | null>(null);
export const SESSION_EXPIRED_MESSAGE = "登录会话已失效，请重新登录。";

function isUnauthenticated(error: unknown) {
  return error instanceof StudentApiError && error.status === 401;
}

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentWorkspaceUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const sessionGenerationRef = useRef(createRequestGeneration());
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshOutcomeRef = useRef<RefreshOutcome>("idle");

  const invalidateSessionRequest = useCallback(() => {
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    advanceSessionEpoch();
    return sessionGenerationRef.current.advance();
  }, []);

  const refreshSession = useCallback(async () => {
    const requestGeneration = invalidateSessionRequest();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    // auth/me 必须重新从 Cookie 识别账号，不能沿用旧标签页的预期账号。
    clearExpectedSessionUserId();
    refreshOutcomeRef.current = "idle";
    setStatus("loading");
    setError(null);
    try {
      const currentUser = await getCurrentUser(controller.signal);
      if (!sessionGenerationRef.current.isCurrent(requestGeneration)) return null;
      setExpectedSessionUserId(currentUser.id);
      refreshOutcomeRef.current = "authenticated";
      setUser(currentUser);
      setStatus("authenticated");
      return currentUser;
    } catch (requestError) {
      if (!sessionGenerationRef.current.isCurrent(requestGeneration)) return null;
      clearExpectedSessionUserId();
      refreshOutcomeRef.current = isUnauthenticated(requestError) ? "anonymous" : "failed";
      setUser(null);
      setStatus("anonymous");
      // 没有会话属于正常状态；网络错误要让页面给出可理解的提示。
      setError(isUnauthenticated(requestError)
        ? null
        : requestError instanceof Error ? requestError.message : "无法确认登录状态");
      return null;
    } finally {
      if (sessionGenerationRef.current.isCurrent(requestGeneration) && refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
    }
  }, [invalidateSessionRequest]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    function handleSessionExpired(event: Event) {
      const sessionEpoch = (event as CustomEvent<SessionExpiredDetail>).detail?.sessionEpoch;
      if (typeof sessionEpoch !== "number" || !isCurrentSessionEpoch(sessionEpoch)) return;
      invalidateSessionRequest();
      clearExpectedSessionUserId();
      setUser(null);
      setStatus("anonymous");
      setError(SESSION_EXPIRED_MESSAGE);
      publishSessionChange("expired");
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, [invalidateSessionRequest]);

  useEffect(() => subscribeToSessionChanges(() => {
    // 其他标签只发出“会话已变更”的非秘密信号；本标签始终重新请求 auth/me。
    clearExpectedSessionUserId();
    void refreshSession();
  }), [refreshSession]);

  useEffect(() => {
    function handleSessionContextChanged(event: Event) {
      const sessionEpoch = (event as CustomEvent<SessionContextChangedDetail>).detail?.sessionEpoch;
      if (typeof sessionEpoch !== "number" || !isCurrentSessionEpoch(sessionEpoch)) return;
      clearExpectedSessionUserId();
      void refreshSession();
    }

    window.addEventListener(SESSION_CONTEXT_CHANGED_EVENT, handleSessionContextChanged);
    return () => window.removeEventListener(SESSION_CONTEXT_CHANGED_EVENT, handleSessionContextChanged);
  }, [refreshSession]);

  useEffect(() => () => {
    invalidateSessionRequest();
  }, [invalidateSessionRequest]);

  const setAuthenticatedUser = useCallback((nextUser: CurrentWorkspaceUser) => {
    invalidateSessionRequest();
    setExpectedSessionUserId(nextUser.id);
    setUser(nextUser);
    setError(null);
    setStatus("authenticated");
    publishSessionChange("signed-in");
  }, [invalidateSessionRequest]);

  const logout = useCallback(async () => {
    const requestGeneration = invalidateSessionRequest();
    try {
      await requestLogout();
    } catch (requestError) {
      if (!sessionGenerationRef.current.isCurrent(requestGeneration)) return false;
      // 请求未被服务端确认时不能伪报退出成功；重新读取 Cookie 后保留实际账号。
      clearExpectedSessionUserId();
      const currentUser = await refreshSession();
      if (currentUser) {
        setError(requestError instanceof Error
          ? `退出未确认：${requestError.message}`
          : "退出未确认，请稍后重试。");
      }
      return false;
    }
    if (!sessionGenerationRef.current.isCurrent(requestGeneration)) return false;
    // 后端已撤销本次请求的令牌；Cookie 可能已被另一标签覆盖成 B，必须重新确认。
    clearExpectedSessionUserId();
    publishSessionChange("signed-out");
    const currentUser = await refreshSession();
    if (currentUser) return false;
    return refreshOutcomeRef.current === "anonymous";
  }, [invalidateSessionRequest, refreshSession]);

  const value = useMemo<StudentSessionContextValue>(() => ({
    user,
    status,
    error,
    refreshSession,
    setAuthenticatedUser,
    logout,
  }), [error, logout, refreshSession, setAuthenticatedUser, status, user]);

  return <StudentSessionContext.Provider value={value}>{children}</StudentSessionContext.Provider>;
}

export function useStudentSession() {
  const context = useContext(StudentSessionContext);
  if (!context) {
    throw new Error("useStudentSession 必须在 StudentSessionProvider 内使用");
  }
  return context;
}
