export type AIConfigKind = "llm" | "ocr";
export type AIProviderOption = { provider: string; apiBaseURL: string };
export type PersonalCapabilityConfig = {
  enabled: boolean; configured: boolean; provider: string; model: string; apiBaseURL: string; hasAPIKey: boolean;
};
export type PersonalAIConfig = {
  mode: "personal" | "managed";
  storage: "windows_dpapi" | "unavailable";
  providers: AIProviderOption[];
  llm: PersonalCapabilityConfig;
  ocr: PersonalCapabilityConfig;
};
export type PersonalConfigDraft = { enabled: boolean; provider: string; model: string; apiKey: string };
export type PersonalConfigUpdate = { enabled: boolean; provider: string; api_base_url: string; model: string; api_key?: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function normalizeCapability(value: unknown): PersonalCapabilityConfig {
  const item = record(value);
  // 显式列出允许回到页面的字段，即使上游异常返回密钥，也不进入组件状态。
  return { enabled: item.enabled === true, configured: item.configured === true, provider: text(item.provider), model: text(item.model), apiBaseURL: text(item.api_base_url), hasAPIKey: item.has_api_key === true };
}
export function normalizePersonalAIConfig(value: unknown): PersonalAIConfig {
  const source = record(value);
  const providers = Array.isArray(source.providers) ? source.providers.map((item) => {
    const option = record(item);
    return { provider: text(option.provider), apiBaseURL: text(option.api_base_url) };
  }).filter((item) => item.provider && item.apiBaseURL.startsWith("https://")) : [];
  return { mode: source.mode === "personal" ? "personal" : "managed", storage: source.storage === "windows_dpapi" ? "windows_dpapi" : "unavailable", providers, llm: normalizeCapability(source.llm), ocr: normalizeCapability(source.ocr) };
}
export function createPersonalConfigDraft(capability: PersonalCapabilityConfig, providers: AIProviderOption[]): PersonalConfigDraft {
  return { enabled: capability.hasAPIKey ? capability.enabled : true, provider: capability.provider || providers[0]?.provider || "", model: capability.model, apiKey: "" };
}
export function buildPersonalConfigUpdate(draft: PersonalConfigDraft, saved: PersonalCapabilityConfig, providers: AIProviderOption[]): PersonalConfigUpdate {
  const provider = providers.find((item) => item.provider === draft.provider);
  if (!provider) throw new Error("请选择列表中的服务商。");
  if (/[\u0000-\u001f\u007f]/.test(draft.model) || /[\u0000-\u001f\u007f]/.test(draft.apiKey)) throw new Error("模型和密钥不能包含控制字符，请检查后重新填写。");
  if (draft.model.length > 255) throw new Error("模型名称不能超过 255 个字符。");
  if (draft.apiKey.length > 512) throw new Error("API Key 不能超过 512 个字符。");
  const model = draft.model.trim();
  const apiKey = draft.apiKey.trim();
  if (!model) throw new Error("请填写服务商提供的模型名称。");
  const sameProvider = saved.provider === provider.provider && saved.apiBaseURL === provider.apiBaseURL;
  if (saved.hasAPIKey && !sameProvider && !apiKey) throw new Error("切换服务商后，请重新填写对应的 API Key。");
  if (!apiKey && !(sameProvider && saved.hasAPIKey)) throw new Error("请填写你自己的 API Key。");
  return { enabled: draft.enabled, provider: provider.provider, api_base_url: provider.apiBaseURL, model, ...(apiKey ? { api_key: apiKey } : {}) };
}
