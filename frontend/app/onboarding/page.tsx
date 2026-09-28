"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentSession } from "../components/student_session_provider";
import { diagnosisApi, emptyFields, interviewFor, shouldOpenSavedReport, hasDiagnosisReport, startDiagnosisAttempt, interviewReplyFor, type InterviewReply, type DiagnosisState, type Profile, type ProfileFields } from "../diagnosis/model";
import { Assessment } from "../diagnosis/assessment";
import { InterviewView } from "../diagnosis/interview_view";
import styles from "../diagnosis/diagnosis.module.css";

export default function OnboardingPage() {
  const { user, status } = useStudentSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    if (user && user.role !== "student") router.replace("/teacher/students");
  }, [user, status, router]);
  return user?.role === "student" ? <Onboarding key={user.id} /> : <main className={styles.screen}>正在确认学习账号…</main>;
}

function Onboarding() {
  const { user, logout } = useStudentSession();
  const router = useRouter();
  const [data, setData] = useState<DiagnosisState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ProfileFields>(emptyFields);
  const [reply, setReply] = useState<InterviewReply | null>(null);
  const [question, setQuestion] = useState({ field: "", message: "", mode: "rules" });
  const [loadingAI, setLoadingAI] = useState(false);
  const [review, setReview] = useState(false);
  const lock = useRef(false);
  const saveBeforeExit = useRef<null | (() => Promise<unknown>)>(null);
  const alive = useRef(true);
  const interview = interviewFor(draft);
  const step = interview.findIndex(row => !draft.answered_fields.includes(row.field));
  const current = step < 0 ? null : interview[step];
  const field = current?.field ?? "";
  const nickname = draft.nickname || user?.display_name || "";
  const { input, total } = interviewReplyFor(field, reply, nickname);
  const hasReport = data ? hasDiagnosisReport(data) : false;
  function setInput(value: string) {
    setReply(previous => ({ field, ...interviewReplyFor(field, previous, nickname), input: value }));
  }
  function setTotal(value: string) {
    setReply(previous => ({ field, ...interviewReplyFor(field, previous, nickname), total: value }));
  }

  async function reload() {
    setError("");
    try {
      const state = await diagnosisApi<DiagnosisState>();
      if (!alive.current) return;
      setData(state);
      setDraft({ ...emptyFields, ...state.profile.fields });
      setReply(null);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "档案加载失败。"); }
  }
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!current || !data || data.profile.confirmed || review) return;
    const controller = new AbortController();
    setQuestion({ field: current.field, message: current.question, mode: "rules" });
    setLoadingAI(true);
    diagnosisApi<{ message: string; mode: string }>("/question", { field: current.field }, "POST", controller.signal)
      .then(result => { if (!controller.signal.aborted) setQuestion({ ...result, field: current.field }); })
      .catch(() => { /* 固定问题已经显示，网络失败不阻断建档。 */ })
      .finally(() => { if (!controller.signal.aborted) setLoadingAI(false); });
    return () => controller.abort();
  }, [current?.field, data?.profile.confirmed, review, Boolean(data)]);

  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "保存失败，请重试。"); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  async function save(fields: ProfileFields, confirmed: boolean) {
    const profile = await diagnosisApi<Profile>("/profile", { fields, confirmed, revision: data!.profile.revision }, "PUT");
    if (!alive.current) return;
    setData(previous => previous ? { ...previous, profile, supported: ["六年级", "升七年级", "七年级"].includes(fields.grade) } : previous);
    setDraft({ ...emptyFields, ...profile.fields });
  }
  function answer(skip = false) {
    void action(async () => {
      if (!current) return;
      const value = input.trim();
      if (!skip && !value) throw new Error("请填写回答，或选择暂不填写。");
      const fields = { ...draft, answered_fields: [...draft.answered_fields, current.field] };
      if (current.field === "exam") {
        if (!skip && (!total || Number(total) <= 0 || Number(value) > Number(total))) throw new Error("请填写有效的得分和满分，得分不能超过满分。");
        fields.exam_score = skip ? null : Number(value); fields.exam_total = skip ? null : Number(total);
      } else if (current.field === "daily_minutes") {
        if (!skip && (!Number.isInteger(Number(value)) || Number(value) < 5 || Number(value) > 180)) throw new Error("请选择 5 至 180 分钟之间的整数。");
        fields.daily_minutes = skip ? null : Number(value);
      } else if (["nickname", "grade", "school_name", "class_name", "textbook", "exam_date", "weak_topics", "goal"].includes(current.field)) {
        Object.assign(fields, { [current.field]: skip ? "" : value });
      } else fields.learning_details = { ...draft.learning_details, [current.field]: skip ? "" : value };
      await save(fields, false);
    });
  }
  async function start() {
    if (!data) return;
    const attempt = await startDiagnosisAttempt(data);
    if (!alive.current) return;
    // 多标签页可能刚交卷；若返回已完成试卷，明确进入报告而非停在准备页。
    if (shouldOpenSavedReport({ profile: data.profile, attempt })) {
      router.replace("/reports");
      return;
    }
    setData(previous => previous ? { ...previous, attempt } : previous);
  }

  if (data && !data.profile.confirmed) return <InterviewView draft={draft} setDraft={setDraft} review={review} setReview={setReview}
    busy={busy} loadingAI={loadingAI} mode={question.field === current?.field ? question.mode : "rules"} message={question.field === current?.field ? question.message : ""} error={error} input={input} setInput={setInput} total={total} setTotal={setTotal}
    onAnswer={answer} onReload={() => void reload()} onExit={() => void action(async () => { if (await logout()) router.replace("/login"); })}
    onConfirm={() => void action(() => save({ ...draft, answered_fields: interview.map(row => row.field) }, true))} />;

  return <main className={styles.screen}>
    <header className={styles.topbar}><Link href="/onboarding" className={styles.brand}>◈ 数学学习教练</Link><span>了解自己 · 找到下一步</span>
      <button type="button" onClick={() => void action(async () => { await saveBeforeExit.current?.(); if (await logout()) router.replace("/login"); })} disabled={busy}>{data?.attempt?.status === "active" ? "保存进度后退出" : "退出登录"}</button></header>
    <div className={styles.steps} aria-label="入学流程"><span className={!data?.profile.confirmed ? styles.active : ""}>01 认识你</span><span className={data?.profile.confirmed ? styles.active : ""}>02 衔接测评</span><span>03 诊断报告</span></div>
    {error && <div className={styles.error} role="alert">{error} <button type="button" onClick={() => void reload()}>重新载入已保存进度</button></div>}
    {!data ? <p className={styles.loading} role="status">正在读取学习档案…</p> : data.attempt?.status === "active"
      ? <Assessment key={data.attempt.id} initial={data.attempt} saveBeforeExit={saveBeforeExit} onSubmitted={() => router.replace("/reports")} />
      : data.profile.confirmed ? <section className={styles.welcome}>
        <p className={styles.kicker}>档案已保存</p><h1>{draft.nickname}，准备好探索数学了吗？</h1>
        <p>不是排名，也不是过关考试。我们想知道哪些内容你已经熟悉，哪些值得一起再学一遍。</p>
        {hasReport && <div className={styles.panel}>
          <h2>你已有一份完成的测评</h2>
          <p>可以查看历史报告，或按当前资料重新测评。重新测评会创建新试卷，旧答案和报告仍然保留。</p>
          <Link href="/reports">查看历史报告 →</Link>
        </div>}
        {data.supported ? <><div className={styles.facts}><div><strong>24</strong><span>道题目</span></div><div><strong>6</strong><span>个数学维度</span></div><div><strong>30–40</strong><span>分钟参考时长 · 不限时</span></div></div>
          <p>可以跳题、返回修改和中途退出；交卷后会保留这次真实结果。无需计算器，请独立完成。教材版本用于了解学习背景，本卷不是某一教材的完整考试。</p>
          <button className={styles.primary} type="button" disabled={busy} onClick={() => void action(start)}>{busy ? "正在准备试卷…" : hasReport ? "重新测评（保留旧报告） →" : "开始数学衔接测评 →"}</button></>
          : <><p>这份试卷面向六年级至七年级，暂不用于你的年级诊断。你可以继续使用已有数学学习内容。</p><Link className={styles.primary} href="/dashboard">进入学习首页</Link></>}
        <Link href="/profile">查看或修改档案</Link>
      </section> : null}
  </main>;
}
