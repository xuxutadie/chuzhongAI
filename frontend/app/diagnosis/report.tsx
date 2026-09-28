"use client";
import { QuestionDiagram } from "./question_diagram";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentSession } from "../components/student_session_provider";
import { diagnosisApi, type DiagnosisState, type Attempt, type Dimension } from "./model";
import styles from "./diagnosis.module.css";

export function DiagnosisReport() {
  const { user } = useStudentSession();
  return user ? <ReportContent key={user.id} userId={user.id} /> : null;
}

function ReportContent({ userId }: { userId: number }) {
  const router = useRouter();
  const [state, setState] = useState<DiagnosisState | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retestConfirm, setRetestConfirm] = useState(false);
  const generation = useRef(0);
  const interpreted = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    diagnosisApi<DiagnosisState>("", undefined, "GET", controller.signal).then(data => {
      if (!controller.signal.aborted) { setState(data); setAttempt(data.attempt); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => { controller.abort(); generation.current++; };
  }, []);
  useEffect(() => {
    if (!attempt?.report || attempt.report.interpretation || interpreted.current.has(attempt.id)) return;
    interpreted.current.add(attempt.id);
    void interpret(attempt);
  }, [attempt?.id]);

  async function interpret(current: Attempt) {
    const id = ++generation.current;
    setBusy(true);
    try {
      const result = await diagnosisApi<Attempt>(`/attempts/${current.id}/interpret`, {});
      if (generation.current === id) setAttempt(result);
    } catch (reason) { if (generation.current === id) setError(reason instanceof Error ? reason.message : "AI 解读暂不可用，已保留规则报告。"); }
    finally { if (generation.current === id) setBusy(false); }
  }
  const report = attempt?.report;
  if (!state) return <p role={error ? "alert" : "status"}>{error || "正在读取诊断报告…"}</p>;
  if (!attempt || !report) return <section className={styles.panel}><h2>先完成一次衔接测评</h2>
    <p>报告会根据你的真实作答生成，不使用演示成绩。</p><Link href="/onboarding">{attempt ? "继续未完成的测评" : "查看学习档案并开始"}</Link>
    {state.history.filter(row => row.status === "submitted").map(row => <button key={row.id} type="button" onClick={() => void diagnosisApi<Attempt>(`/attempts/${row.id}`).then(setAttempt).catch(reason => setError(reason.message))}>查看 {row.submitted_at?.slice(0, 10)} 的报告</button>)}</section>;
  const dist = report.distribution;
  return <div className={styles.report}>
    <section className={styles.reportHero}><div><p>数学六升七 · 本次作答诊断</p><h2>{attempt.profile.nickname}，这是你的学习起点</h2>
      <p>{attempt.profile.grade} · {attempt.profile.textbook}<br />{attempt.submitted_at?.slice(0, 10)} · 24 道题 · {attempt.version}</p></div>
      <div className={styles.reportScore}><strong>{report.score}</strong><span>本次得分 / 100</span></div></section>
    <div className={styles.actions}>
      <a className={styles.primary} href={`/api/diagnosis/attempts/${attempt.id}/pdf?expected_user_id=${userId}`} download>下载完整诊断 PDF ↓</a>
      <Link href="/dashboard">进入今日学习 →</Link><Link href="/profile">查看学习档案</Link>
    </div>
    <p className={styles.muted} role="status">{busy ? "AI 正在补充学习建议。现在下载将包含已完成的规则诊断；稍后可重新下载。" : report.interpretation ? "AI 补充建议已生成；所有数值与图表仍由真实作答计算。" : "当前为规则诊断 · AI 未启用或暂不可用，图表、解析和 PDF 正常可用。"}</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <p className={styles.muted}>{report.notice}</p>
    <div className={styles.chartGrid}><section className={styles.panel} aria-label="各维度柱状图"><h3>六个维度，逐项看清</h3><p className={styles.muted}>答对题数 / 该维度题数 · 每个维度 4 题</p>
      {report.dimensions.map(d => <div className={styles.barRow} key={d.name}><div><span>{d.name}</span><span>{d.correct}/{d.sample_size} 题 · {d.score}%</span></div>
        <div className={styles.barTrack} role="meter" aria-label={d.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.score}><span style={{ width: `${d.score}%` }} /></div></div>)}
    </section><section className={styles.panel}><h3>数学能力雷达图</h3><p className={styles.muted}>与柱状图共用统计值 · 刻度 0–100%</p><Radar dimensions={report.dimensions} /></section></div>
    <section className={styles.panel} aria-label="答题分布饼图"><h3>答题分布</h3><div className={styles.pieLayout}>
      <div className={styles.donut} role="img" aria-label={`答对 ${dist.correct} 题，答错 ${dist.wrong} 题，未作答 ${dist.skipped} 题`}
        style={{ background: `conic-gradient(#159c93 0 ${dist.correct/24*100}%, #d98838 ${dist.correct/24*100}% ${(dist.correct+dist.wrong)/24*100}%, #acbac8 ${(dist.correct+dist.wrong)/24*100}% 100%)` }}><div><strong>24</strong><span>本次题量</span></div></div>
      <div className={styles.legend}>{([ ["答对", dist.correct, "#159c93"], ["答错", dist.wrong, "#d98838"], ["未作答", dist.skipped, "#acbac8"] ] as const).map(([label, count, color]) => <p key={label}><i style={{ background: color }} />{label} {count} 题 · {(count/24*100).toFixed(1)}%</p>)}<p className={styles.muted}>未作答不直接等于不会，需要结合实际情况判断。</p></div>
    </div></section>
    <section className={styles.panel}><h3>下一步先练什么？</h3><p>优先回顾：{report.priority.join("、")}。如果该维度有跳题，请先确认跳题原因。</p>
      <div className={styles.adviceGrid}>{report.dimensions.map(d => <article key={d.name}><strong>{d.name} · {d.correct}/{d.sample_size} 题</strong><p>{d.advice}</p></article>)}</div>
      {report.interpretation ? <><h4>AI 补充建议</h4><p>{report.interpretation}</p></> : <button type="button" disabled={busy} onClick={() => void interpret(attempt)}>重新尝试 AI 解读</button>}
    </section>
    <section className={styles.panel}><h3>两周学习建议</h3><div className={styles.adviceGrid}>
      <article><strong>第 1–3 天 · 找到起点</strong><p>回看答错题，画图或说清题意；先处理「{report.priority[0]}」。</p></article>
      <article><strong>第 4–7 天 · 练习与说理</strong><p>围绕「{report.priority[1]}」做少量变式题，订正时记录关键步骤。</p></article>
      <article><strong>第 8–10 天 · 适应初中</strong><p>从负数、字母表示数和简单等式开始，把文字关系转成图或算式。</p></article>
      <article><strong>第 11–14 天 · 回顾复测</strong><p>混合练习六个维度，复习错题。准备好后独立复测；熟悉题目也可能影响分数。</p></article>
    </div><p>每日时间：{attempt.profile.daily_minutes ? `${attempt.profile.daily_minutes} 分钟（你填写的计划）` : "未填写，可与老师一起商量"}。</p></section>
    <section className={styles.panel}><h3>逐题证据与解析</h3><p className={styles.muted}>点开题目查看当时的选择和参考解析，不能据此推断“粗心”或心理状态。</p>
      {report.evidence.map((q, index) => <details className={styles.evidence} key={q.id}><summary>{index+1}. {q.text} · {{ correct: "答对", wrong: "答错", skipped: "未作答" }[q.state]}</summary>
        <QuestionDiagram diagram={q.diagram} />
        <p>{Object.entries(q.options).map(([key, value]) => `${key}. ${value}`).join("　")}</p><p>你的选择：{q.chosen || "未作答"}；参考答案：{q.answer}</p><p>{q.explanation}</p></details>)}
    </section>
    <section className={styles.panel}><h3>历史报告与独立复测</h3><div className={styles.history}>
      {state.history.filter(row => row.status === "submitted").map((row, index) => <button type="button" disabled={busy} aria-pressed={attempt.id === row.id} key={row.id} onClick={() => {
        ++generation.current;
        void diagnosisApi<Attempt>(`/attempts/${row.id}`).then(setAttempt).catch(reason => setError(reason.message));
      }}>{row.submitted_at?.slice(0, 10)} · 第 {state.history.filter(row => row.status === "submitted").length-index} 次</button>)}
    </div><p>复测不覆盖首次记录。每份报告保存当时的档案和题目版本，不据此虚构进步趋势。</p>
      {!retestConfirm ? <button type="button" disabled={busy} onClick={() => setRetestConfirm(true)}>准备一次独立复测</button> : <><p>将开始新的 24 题测评，已有报告全部保留。确认继续吗？</p>
        <button type="button" disabled={busy} onClick={() => setRetestConfirm(false)}>暂不复测</button><button className={styles.primary} disabled={busy} type="button" onClick={async () => {
          setBusy(true); try { await diagnosisApi<Attempt>("/attempts", { retest: true }); router.push("/onboarding"); }
          catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法开始复测。"); setBusy(false); }
        }}>确认开始复测</button></>}
    </section>
  </div>;
}

export function Radar({ dimensions }: { dimensions: Dimension[] }) {
  const point = (index: number, scale: number) => {
    const angle = -Math.PI / 2 + index * Math.PI / 3;
    return [200 + 110 * scale * Math.cos(angle), 180 + 110 * scale * Math.sin(angle)];
  };
  const polygon = (scale: number) => dimensions.map((_, i) => point(i, scale).join(",")).join(" ");
  return <svg className={styles.radar} viewBox="0 0 400 360" role="img" aria-label={dimensions.map(d => `${d.name} ${d.score}%`).join("，")}>
    {[.25, .5, .75, 1].map(scale => <g key={scale}><polygon points={polygon(scale)} fill="none" stroke="#d4e1ed" /><text x="204" y={180-110*scale} fontSize="10" fill="#6f8395">{scale*100}</text></g>)}
    {dimensions.map((d, i) => { const [x, y] = point(i, 1.37); const [lx, ly] = point(i, 1); return <g key={d.name}><line x1="200" y1="180" x2={lx} y2={ly} stroke="#d4e1ed" /><text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#17334c">{d.name}</text></g>; })}
    <polygon points={dimensions.map((d, i) => point(i, d.score/100).join(",")).join(" ")} fill="#159c9338" stroke="#159c93" strokeWidth="2.5" />
    {dimensions.map((d, i) => { const [x, y] = point(i, d.score/100); return <circle key={d.name} cx={x} cy={y} r="4" fill="#159c93" />; })}
  </svg>;
}
