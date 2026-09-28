"use client";
import { QuestionDiagram } from "./question_diagram";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { diagnosisApi, dimensions, type Attempt } from "./model";
import styles from "./diagnosis.module.css";

export function Assessment({ initial, onSubmitted, saveBeforeExit }: { initial: Attempt; onSubmitted: () => void; saveBeforeExit: MutableRefObject<null | (() => Promise<unknown>)> }) {
  const [attempt, setAttempt] = useState(initial);
  const [index, setIndex] = useState(() => Math.max(0, initial.paper.findIndex(q => !(q.id in initial.answers))));
  const [choice, setChoice] = useState<string | null>(initial.answers[initial.paper[index].id] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lock = useRef(false);
  const entered = useRef(Date.now());
  const alive = useRef(true);
  const q = attempt.paper[index];
  const answered = Object.values(attempt.answers).filter(Boolean).length;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    // 外层主动重新加载时恢复最新版本；平时的本地作答不被旧初值覆盖。
    const next = Math.max(0, initial.paper.findIndex(item => !(item.id in initial.answers)));
    setAttempt(initial); setIndex(next); setChoice(initial.answers[initial.paper[next].id] ?? null);
    setDirty(false); setConfirm(false); entered.current = Date.now();
  }, [initial]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function perform(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "保存失败，请重试。"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function persist(value = choice) {
    const times = { ...attempt.times, [q.id]: Math.min(86400, (attempt.times[q.id] || 0) + Math.round((Date.now() - entered.current) / 1000)) };
    const saved = await diagnosisApi<Attempt>(`/attempts/${attempt.id}/answers`, { revision: attempt.revision, answers: { ...attempt.answers, [q.id]: value }, times }, "PUT");
    if (alive.current) { setAttempt(saved); setDirty(false); }
    entered.current = Date.now();
    return saved;
  }
  useEffect(() => {
    saveBeforeExit.current = async () => {
      if (lock.current) throw new Error("正在保存答案，请稍候再退出。");
      lock.current = true;
      setBusy(true);
      try { return await persist(); }
      finally { lock.current = false; if (alive.current) setBusy(false); }
    };
    return () => { saveBeforeExit.current = null; };
  });
  function go(next: number, skip = false) {
    void perform(async () => {
      const saved = await persist(skip ? null : choice);
      if (!alive.current) return;
      setIndex(next); setChoice(saved.answers[saved.paper[next].id] ?? null); setConfirm(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  return <section className={styles.assessment}>
    <header className={styles.testHeading}><div><p className={styles.kicker}>数学六升七 · 独立完成</p><h1>一点一点，发现你的起点</h1></div><span>已保存 {answered} / 24 题</span></header>
    <progress className={styles.progress} max={24} value={answered} aria-label="已保存作答进度" />
    <div className={styles.testGrid}>
      <section className={styles.questionCard}>
        <div className={styles.questionMeta}><span>第 {index + 1} / 24 题</span><span>{dimensions[q.dimension]} · {q.stage === "basic" ? "小学基础" : "初中衔接"}</span></div>
        <h2>{q.text}</h2>
        <QuestionDiagram diagram={q.diagram} />
        <fieldset className={styles.options} disabled={busy}><legend>请选择一个答案</legend>
          {Object.entries(q.options).map(([key, value]) => <label className={choice === key ? styles.selected : ""} key={key}>
            <input type="radio" name={q.id} value={key} checked={choice === key} onChange={() => { setChoice(key); setDirty(true); }} /><span>{key}</span>{value}
          </label>)}
        </fieldset>
        {error && <p role="alert" className={styles.error}>{error} <button type="button" disabled={busy} onClick={() => void perform(async () => {
          const saved = await diagnosisApi<Attempt>(`/attempts/${attempt.id}`);
          if (saved.status === "submitted") onSubmitted();
          else { setAttempt(saved); setChoice(saved.answers[q.id] ?? null); setDirty(false); }
        })}>读取最新进度</button></p>}
        <div className={styles.actions}>
          <button disabled={busy || index === 0} onClick={() => go(index - 1)} type="button">上一题</button>
          <button className={styles.primary} disabled={busy} onClick={() => index < 23 ? go(index + 1) : void perform(async () => { await persist(); setConfirm(true); })} type="button">{busy ? "保存中…" : index < 23 ? "保存并继续 →" : "保存并检查答题卡"}</button>
          <button disabled={busy} onClick={() => go(Math.min(23, index + 1), true)} type="button">这题先跳过</button>
        </div>
        <p className={styles.muted}>{dirty ? "本题选择尚未保存，请点击保存并继续。" : "已保存到你的账号。可以随时回来继续。"} 时长仅供参考，不据此推断答错原因。</p>
      </section>
      <aside className={styles.answerSheet}><h2>答题卡</h2><p>蓝色表示已保存答案，灰色表示未作答。</p>
        <div className={styles.numberGrid}>{attempt.paper.map((row, i) => <button disabled={busy} key={row.id} type="button" onClick={() => go(i)}
          className={attempt.answers[row.id] ? styles.done : ""} aria-current={i === index ? "step" : undefined} aria-label={`第 ${i+1} 题，${attempt.answers[row.id] ? "已作答" : "未作答"}`}>{i + 1}</button>)}</div>
        <button className={styles.primary} type="button" disabled={busy} onClick={() => void perform(async () => { await persist(); setConfirm(true); })}>检查并交卷</button>
        <button type="button" disabled={busy} onClick={() => void perform(async () => { await persist(); })}>仅保存当前进度</button>
        <p>交卷前不会公布答案；交卷后本次记录将锁定。</p>
      </aside>
    </div>
    {confirm && <div className={styles.modalBackdrop}><section className={styles.submitDialog} role="dialog" aria-modal="true" aria-labelledby="submit-title" onKeyDown={event => {
      if (event.key === "Escape" && !busy) setConfirm(false);
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <h2 id="submit-title">确认提交本次测评？</h2><p>已作答 {answered} 题，还有 {24 - answered} 题未作答。未作答会单独标记，并按 0 分计入本次卷面分。</p>
      <p>提交后不能修改本次答案；以后可以独立复测，不覆盖本次结果。</p>
      <div className={styles.actions}><button autoFocus type="button" disabled={busy} onClick={() => setConfirm(false)}>返回检查</button>
        <button className={styles.primary} type="button" disabled={busy} onClick={() => void perform(async () => {
          await diagnosisApi<Attempt>(`/attempts/${attempt.id}/submit`, { revision: attempt.revision });
          if (alive.current) onSubmitted();
        })}>{busy ? "正在生成报告…" : "确认交卷，查看报告"}</button></div>{error && <p role="alert">{error}</p>}
    </section></div>}
  </section>;
}
