"use client";

import { useRef, useState } from "react";
import { buildPersonalConfigUpdate, createPersonalConfigDraft, type AIConfigKind, type PersonalAIConfig } from "../ai-config-model";
import { clearPersonalAIConfig, savePersonalAIConfig } from "../student-api";
import { getSessionEpoch, isCurrentSessionEpoch } from "../session_epoch.js";
import styles from "./settings.module.css";

const providerNames: Record<string, string> = { openai: "OpenAI", deepseek: "DeepSeek", qwen: "通义千问", dashscope: "通义千问", moonshot: "Moonshot / Kimi", zhipu: "智谱 AI", siliconflow: "硅基流动" };

export function PersonalConfigForm({ kind, config, onSaved }: { kind: AIConfigKind; config: PersonalAIConfig; onSaved: (config: PersonalAIConfig) => void }) {
  const capability = config[kind];
  const [draft, setDraft] = useState(() => createPersonalConfigDraft(capability, config.providers));
  const [pending, setPending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pendingRef = useRef(false);
  const provider = config.providers.find((item) => item.provider === draft.provider);
  const canKeepKey = capability.hasAPIKey && capability.provider === draft.provider && capability.apiBaseURL === provider?.apiBaseURL;
  const editable = config.storage === "windows_dpapi" && config.providers.length > 0;
  const name = kind === "llm" ? "AI 答疑与错因分析" : "OCR 拍照识题";

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !editable) return;
    setError(""); setMessage("");
    const epoch = getSessionEpoch();
    try {
      const payload = buildPersonalConfigUpdate(draft, capability, config.providers);
      pendingRef.current = true; setPending(true);
      // 密钥只在本次请求中使用；不写入浏览器存储，提交后立即清空输入。
      const request = savePersonalAIConfig(kind, payload);
      setDraft((current) => ({ ...current, apiKey: "" }));
      const result = await request;
      if (!isCurrentSessionEpoch(epoch)) return;
      onSaved(result);
      setMessage("配置已保存。尚未向服务商发起请求，首次使用时才会实际调用并可能产生费用。");
    } catch (requestError) {
      if (isCurrentSessionEpoch(epoch)) setError(requestError instanceof Error ? requestError.message : "保存失败，请稍后重试。");
    } finally { pendingRef.current = false; setPending(false); }
  }

  async function clear() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(""); setMessage("");
    const epoch = getSessionEpoch();
    try {
      const result = await clearPersonalAIConfig(kind);
      if (!isCurrentSessionEpoch(epoch)) return;
      setDraft(createPersonalConfigDraft(result[kind], result.providers));
      setConfirmClear(false); onSaved(result);
      setMessage("该能力的个人配置已清除，本地练习与手动错题仍可使用。");
    } catch (requestError) {
      if (isCurrentSessionEpoch(epoch)) setError(requestError instanceof Error ? requestError.message : "清除失败，请稍后重试。");
    } finally { pendingRef.current = false; setPending(false); }
  }

  return (
    <section className={styles.card} aria-labelledby={`${kind}-heading`}>
      <div className={styles.cardHeader}>
        <div><p>{kind === "llm" ? "文字学习" : "图片识别"}</p><h2 id={`${kind}-heading`}>{name}</h2></div>
        <span className={capability.configured ? styles.ready : styles.waiting}>{capability.configured ? "已配置 · 未验证连接" : capability.hasAPIKey ? "已保存 · 未启用或不完整" : "尚未配置"}</span>
      </div>
      <p className={styles.hint}>{kind === "ocr" ? "请使用支持图片输入的视觉模型。识别公式与图形后，仍需你确认题目是否准确。" : "用于问 AI 老师、分析错题原因与知识点。请填写服务商账号实际可用的模型名称。"}</p>
      <form aria-busy={pending} onSubmit={save}>
        <fieldset className={styles.fields} disabled={pending || !editable}>
          <legend className={styles.srOnly}>{name}个人配置</legend>
          <label className={styles.toggle}><input checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} type="checkbox" />启用此能力</label>
          <label>服务商
            <select onChange={(event) => { setDraft({ ...draft, provider: event.target.value, apiKey: "", model: "" }); setError(""); setMessage(""); }} required value={draft.provider}>
              {config.providers.length === 0 ? <option value="">暂无可用服务商</option> : null}
              {config.providers.map((item) => <option key={item.provider} value={item.provider}>{providerNames[item.provider] || item.provider}</option>)}
            </select>
          </label>
          <label>官方服务地址（由平台限制，不可修改）<input readOnly type="url" value={provider?.apiBaseURL || ""} /></label>
          <label>模型名称<input autoComplete="off" maxLength={255} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder={kind === "ocr" ? "填写支持图片输入的模型名" : "填写服务商提供的模型名"} required value={draft.model} /></label>
          <label>你的 API Key
            <input aria-describedby={`${kind}-key-hint`} autoComplete="off" maxLength={512} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={canKeepKey ? "已有密钥，留空保留；填写则替换" : "填写你在该服务商获取的 API Key"} required={!canKeepKey} spellCheck={false} type="password" value={draft.apiKey} />
          </label>
          <p className={styles.hint} id={`${kind}-key-hint`}>{canKeepKey ? "密钥已加密保存，页面无法读取原值；留空不会删除。" : capability.hasAPIKey ? "已切换服务商，请重新填写对应密钥。" : "不要填写登录密码。此处只填写你自己的服务商 API Key。"} 提交后输入会清空；若保存失败，需要重新填写。</p>
          <button className={styles.primaryButton} type="submit">{pending ? "正在处理…" : "保存个人配置"}</button>
        </fieldset>
      </form>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {message ? <p className={styles.notice} role="status">{message}</p> : null}
      {capability.hasAPIKey ? <div className={styles.clearArea}>
        {confirmClear ? <>
          <p>确认清除此项个人配置？以后使用需要重新填写；不会删除学习记录。</p>
          <div className={styles.actions}><button className={styles.dangerButton} disabled={pending} onClick={() => void clear()} type="button">确认清除</button><button disabled={pending} onClick={() => setConfirmClear(false)} type="button">取消</button></div>
        </> : <button disabled={pending} onClick={() => setConfirmClear(true)} type="button">清除此项个人配置</button>}
      </div> : null}
    </section>
  );
}
