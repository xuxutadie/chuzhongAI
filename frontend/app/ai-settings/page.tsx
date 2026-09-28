"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { type PersonalAIConfig } from "../ai-config-model";
import { StudentPageShell } from "../components/student_page_shell";
import { useStudentSession } from "../components/student_session_provider";
import { getPersonalAIConfig } from "../student-api";
import { getSessionEpoch, isCurrentSessionEpoch } from "../session_epoch.js";
import { PersonalConfigForm } from "./personal_config_form";
import styles from "./settings.module.css";

function AISettingsContent() {
  const [config, setConfig] = useState<PersonalAIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const epoch = getSessionEpoch();
    setLoading(true); setError("");
    try {
      const result = await getPersonalAIConfig(controller.signal);
      if (!controller.signal.aborted && isCurrentSessionEpoch(epoch)) setConfig(result);
    } catch (requestError) {
      if (!controller.signal.aborted && isCurrentSessionEpoch(epoch)) setError(requestError instanceof Error ? requestError.message : "无法读取配置，请稍后重试。");
    } finally { if (!controller.signal.aborted && isCurrentSessionEpoch(epoch)) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => controllerRef.current?.abort(); }, [refresh]);

  return <div className={styles.page}>
    {loading ? <p className={styles.notice} role="status">正在读取你的 AI 配置…</p> : null}
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button onClick={() => void refresh()} type="button">重新读取</button></div> : null}
    {!loading && config ? <>
      <section className={styles.intro} aria-labelledby="config-mode-title">
        <h2 id="config-mode-title">{config.mode === "personal" ? "自主注册 · 使用自己的 API" : "教师创建 · 由老师统一提供"}</h2>
        <p>{config.mode === "personal" ? "AI 答疑与 OCR 识题分别配置，不会借用老师或其他同学的密钥。外部服务费用由你的服务商账号承担，请先和家长确认额度与使用安排。" : "你的账号由老师创建，AI 与 OCR 使用老师统一配置的服务，不需要你购买或填写 API。若显示未配置，请联系老师；仍可继续本地练习、手动整理错题。"}</p>
        {config.mode === "personal" ? <p>密钥只在输入时暂存于页面，提交后清空；服务器使用本机 Windows 加密保存，不向浏览器返回密钥明文。保存不等于连接验证，使用时才会请求外部服务。</p> : null}
        <div className={styles.actions}><Link className={styles.primaryLink} href="/dashboard">{config.mode === "personal" ? "稍后配置，先去学习" : "返回学习首页"}</Link><Link href="/wrong-questions">手动整理错题</Link></div>
      </section>
      {config.mode === "personal" ? <>
        {config.storage !== "windows_dpapi" ? <p className={styles.error} role="alert">当前服务器不支持个人密钥安全存储，暂时不能保存 API。请联系部署管理员；本地练习和手动错题仍可使用。</p> : null}
        <div className={styles.grid}>{(["llm", "ocr"] as const).map((kind) => <PersonalConfigForm key={kind} kind={kind} config={config} onSaved={setConfig} />)}</div>
      </> : <div className={styles.grid}>{(["llm", "ocr"] as const).map((kind) => <section className={styles.card} key={kind}>
        <h2>{kind === "llm" ? "AI 答疑与错因分析" : "OCR 拍照识题"}</h2>
        <p className={config[kind].configured ? styles.ready : styles.waiting}>{config[kind].configured ? "老师已配置" : "等待老师配置"}</p>
        <p className={styles.hint}>{config[kind].configured ? "实际调用是否成功，还取决于服务商状态与额度。你无需填写个人密钥。" : "请联系老师开启此项能力，不影响本地练习与手动错题。"}</p>
      </section>)}</div>}
    </> : null}
  </div>;
}

export default function AISettingsPage() {
  const { user, status } = useStudentSession();
  return <StudentPageShell eyebrow="AI 教练" title="我的 AI 设置" description="按账号来源使用个人或教师统一服务；未配置 API 也能继续本地学习。">
    {status === "authenticated" && user?.role === "student" ? <AISettingsContent key={`ai-settings-${user.id}`} /> : null}
  </StudentPageShell>;
}
