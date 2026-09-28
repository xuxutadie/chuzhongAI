import assert from "node:assert/strict";
import test from "node:test";
import { buildPersonalConfigUpdate, createPersonalConfigDraft, normalizePersonalAIConfig } from "../app/ai-config-model.ts";

const response = {
  mode: "personal", storage: "windows_dpapi",
  providers: [{ provider: "openai", api_base_url: "https://api.openai.com/v1" }, { provider: "deepseek", api_base_url: "https://api.deepseek.com" }],
  llm: { enabled: true, configured: true, provider: "openai", model: "example-model", api_base_url: "https://api.openai.com/v1", has_api_key: true, api_key: "do-not-copy" },
  ocr: { enabled: false, configured: false, provider: null, model: null, api_base_url: null, has_api_key: false },
};

test("个人配置解析只保留公开状态，不携带密钥", () => {
  const config = normalizePersonalAIConfig(response);
  assert.equal(config.mode, "personal");
  assert.equal(config.llm.hasAPIKey, true);
  assert.equal(JSON.stringify(config).includes("do-not-copy"), false);
  assert.equal(normalizePersonalAIConfig({}).mode, "managed");
  assert.equal(normalizePersonalAIConfig({}).storage, "unavailable");
});

test("已有配置留空密钥时保留原值，表单不会回填密钥", () => {
  const config = normalizePersonalAIConfig(response);
  const draft = createPersonalConfigDraft(config.llm, config.providers);
  assert.equal(draft.apiKey, "");
  const update = buildPersonalConfigUpdate(draft, config.llm, config.providers);
  assert.equal("api_key" in update, false);
  assert.equal(update.api_base_url, "https://api.openai.com/v1");
});

test("切换服务商必须重新提供密钥，未知服务商不能提交", () => {
  const config = normalizePersonalAIConfig(response);
  const draft = createPersonalConfigDraft(config.llm, config.providers);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, provider: "deepseek" }, config.llm, config.providers), /重新填写/);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, provider: "custom", apiKey: "new-key" }, config.llm, config.providers), /服务商/);
  const update = buildPersonalConfigUpdate({ ...draft, provider: "deepseek", apiKey: " new-key " }, config.llm, config.providers);
  assert.equal(update.api_key, "new-key");
  assert.equal(update.api_base_url, "https://api.deepseek.com");
});

test("新配置不能空密钥或空模型，避免误报可用", () => {
  const config = normalizePersonalAIConfig(response);
  const draft = { ...createPersonalConfigDraft(config.ocr, config.providers), enabled: true, model: "vision-model" };
  assert.throws(() => buildPersonalConfigUpdate(draft, config.ocr, config.providers), /API Key/);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, apiKey: "test-key", model: " " }, config.ocr, config.providers), /模型/);
});

test("个人配置与后端长度和控制字符限制一致", () => {
  const config = normalizePersonalAIConfig(response);
  const draft = createPersonalConfigDraft(config.llm, config.providers);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, apiKey: "k".repeat(513) }, config.llm, config.providers), /512/);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, model: "m".repeat(256) }, config.llm, config.providers), /255/);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, apiKey: "key\u0000value" }, config.llm, config.providers), /控制字符/);
  assert.throws(() => buildPersonalConfigUpdate({ ...draft, model: "model\nname" }, config.llm, config.providers), /控制字符/);
});
