"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { type ProfileFields, interviewFor } from "./model";
import { ProfileEditor } from "./profile_editor";
import { InterviewChat } from "./interview_chat";
import base from "./diagnosis.module.css";
import styles from "./interview.module.css";

type Props = {
  draft: ProfileFields; setDraft: (value: ProfileFields) => void; review: boolean; setReview: (value: boolean) => void;
  busy: boolean; loadingAI: boolean; mode: string; message: string; error: string;
  input: string; setInput: (value: string) => void; total: string; setTotal: (value: string) => void;
  onAnswer: (skip?: boolean) => void; onConfirm: () => void; onExit: () => void; onReload: () => void;
};

export function InterviewView(props: Props) {
  const { draft, busy, review, loadingAI, input, total } = props;
  const rows = interviewFor(draft);
  const current = rows.find(row => !draft.answered_fields.includes(row.field));
  const completed = rows.filter(row => draft.answered_fields.includes(row.field));
  const [animated, setAnimated] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const root = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, [current?.field, review]);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); };
  }, []);
  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setFullscreenError("此浏览器不支持隐藏工具栏，当前已铺满页面内容区。");
    } catch { setFullscreenError("浏览器未允许进入全屏，当前已铺满页面内容区。"); }
  }
  return <main ref={root} className={`${base.screen} ${styles.immersive}`}>
    <header className={styles.bar}><div><h1 className={styles.brand}>数学学习教练</h1><span className={styles.meta}>认识你 · 已聊 {completed.length} / {rows.length} 项</span></div><div className={styles.barActions}>
      <button type="button" aria-pressed={!animated} onClick={() => setAnimated(!animated)}>{animated ? "关闭动画" : "开启动画"}</button>
      <button type="button" disabled={busy} onClick={() => props.setReview(!review)}>{review ? "返回聊天" : "检查资料"}</button>
      <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? "退出全屏" : "进入全屏"}</button>
      <details className={styles.help}><summary>说明</summary><div><p>{props.mode === "ai" ? "AI 引导" : "规则引导"} · 回答随账号保存</p><Link href="/ai-settings">AI 设置</Link><p>称呼可用昵称。成绩与学习感受可跳过；已配置 AI 时，教材、困难、目标及学习回答会交给你或老师配置的 AI 服务，用于引导和建议。不会主动发送账号、密码和昵称，请勿在自由回答中填写隐私信息。</p></div></details>
      <button type="button" disabled={busy} onClick={props.onExit}>退出登录</button>
    </div></header>
    <div className={styles.progressLine} role="progressbar" aria-label="访谈完成进度（会按回答追加追问）" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={completed.length}><span style={{ width: `${completed.length / rows.length * 100}%` }} /></div>
    {(props.error || fullscreenError) && <div className={styles.error} role="alert">{props.error || fullscreenError}{props.error && <button type="button" onClick={props.onReload}>重新载入</button>}</div>}
    {!current || review ? <section className={styles.review}><h1>这些信息，准确吗？</h1><p>这是你告诉我的学习情况，不是对能力的判断。你可以修改后再开始测评。</p>
      <ProfileEditor value={draft} onChange={props.setDraft} />
      <div className={base.actions}><button type="button" className={base.primary} disabled={busy} onClick={props.onConfirm}>确认档案，准备测评</button>
        {review && current && <button type="button" disabled={busy} onClick={() => props.setReview(false)}>继续对话</button>}</div>
    </section> : <div className={styles.layout}>
      <InterviewChat draft={draft} field={current.field} question={props.message || current.question} loading={loadingAI} busy={busy} animated={animated}
        questionActions={<div className={styles.questionActions}>
          {current.options.length > 0 && <><p className={styles.answerHint}>可以选一个，再补充你的想法</p><div className={styles.choices} role="group" aria-label="当前问题的回答提示">{current.options.map(option => <button key={option} type="button" disabled={busy} aria-pressed={input === option} onClick={() => { props.setInput(option); inputRef.current?.focus({ preventScroll: true }); }}>{option}{current.field === "daily_minutes" ? " 分钟" : ""}</button>)}</div></>}
          {!["nickname", "grade", "school_name", "class_name", "textbook"].includes(current.field) && <button type="button" className={styles.skip} disabled={busy} onClick={() => props.onAnswer(true)}>暂不回答</button>}
        </div>} />
      <form className={styles.compose} aria-label="回复学习教练" onSubmit={event => { event.preventDefault(); props.onAnswer(); }}>
        <div className={styles.entry}><label><span className={styles.screenReaderOnly}>{current.title}</span><input key={current.field} ref={inputRef} value={input} onChange={event => props.setInput(event.target.value)} disabled={busy}
          maxLength={["nickname", "class_name"].includes(current.field) ? 40 : current.field === "grade" ? 24 : ["textbook", "school_name"].includes(current.field) ? 100 : current.field === "exam_date" ? 80 : 400}
          type={["exam", "daily_minutes"].includes(current.field) ? "number" : "text"} min={0} step={current.field === "exam" ? "0.5" : "1"} placeholder={current.field === "exam" ? "考试得分" : "回复学习教练…"} /></label>
          {current.field === "exam" && <label><span className={styles.screenReaderOnly}>试卷满分</span><input type="number" min={1} max={1000} step="0.5" value={total} onChange={event => props.setTotal(event.target.value)} disabled={busy} placeholder="满分（如 100）" /></label>}
          <button type="submit" className={base.primary} disabled={busy}>{busy ? "保存中…" : "发送 ↑"}</button>
        </div>
      </form>
    </div>}
  </main>;
}
