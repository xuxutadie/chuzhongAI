import {
  createSameOriginRequest,
  notifySessionContextChanged,
  notifySessionExpired,
  SESSION_CONTEXT_CHANGED_HEADER,
  SessionContextChangedError,
  StudentApiError,
} from "./student-api";
import { getSessionEpoch } from "./session_epoch.js";

export type IntegrationCapabilityStatus = {
  enabled: boolean;
  configured: boolean;
  provider: string | null;
  model: string | null;
};

export type IntegrationStatus = {
  llm: IntegrationCapabilityStatus;
  ocr: IntegrationCapabilityStatus;
};

async function requestRuntimeJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestSessionEpoch = getSessionEpoch();
  const response = await fetch(path, createSameOriginRequest(init, path));
  const body = await response.json().catch(() => ({})) as T & { detail?: unknown };
  if (!response.ok) {
    notifySessionExpired(path, response.status, requestSessionEpoch);
    notifySessionContextChanged(path, response, requestSessionEpoch);
    if (response.headers.get(SESSION_CONTEXT_CHANGED_HEADER) === "1") {
      throw new SessionContextChangedError();
    }
    throw new StudentApiError(
      typeof body.detail === "string" ? body.detail : "服务暂时不可用，请稍后重试。",
      response.status,
    );
  }
  return body;
}

export function getTeacherIntegrationStatus() {
  return requestRuntimeJson<IntegrationStatus>("/api/teacher/ai-config/status");
}

export function askStudentAssistant(question: string) {
  return requestRuntimeJson<{ reply: string; model_name: string; latency_ms: number }>("/api/student/assistant", {
    body: JSON.stringify({ question }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}
