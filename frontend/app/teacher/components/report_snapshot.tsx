"use client";
import { Radar } from "../../diagnosis/report";
import { QuestionDiagram } from "../../diagnosis/question_diagram";
import type { Report } from "../../diagnosis/model";
import styles from "../../diagnosis/diagnosis.module.css";

/** 纯展示已提交报告；不调用学生端 AI 解读、重测或作答接口。 */
export function ReportSnapshot({ report }: { report: Report }) {
  const dist = report.distribution;
  const total = dist.correct + dist.wrong + dist.skipped;
  const correct = total ? dist.correct / total * 100 : 0;
  const answered = total ? (dist.correct + dist.wrong) / total * 100 : 0;
  return <div className={styles.report}>
    <p>系统测评：{report.score} / 100 分 · 共 {total} 题</p>
    <p>{report.notice}</p>
    <div className={styles.chartGrid}><section className={styles.panel}><h3>各维度正确率</h3>{report.dimensions.map(d => <div className={styles.barRow} key={d.name}><div><span>{d.name}</span><span>{d.correct}/{d.sample_size} 题 · {d.score}%</span></div><div className={styles.barTrack} role="meter" aria-label={d.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.score}><span style={{width:`${d.score}%`}} /></div></div>)}</section>
      <section className={styles.panel}><h3>维度雷达图</h3><Radar dimensions={report.dimensions} /></section></div>
    <section className={styles.panel}><h3>本次作答分布</h3><div className={styles.pieLayout}><div className={styles.donut} role="img" aria-label={`答对${dist.correct}题，答错${dist.wrong}题，未作答${dist.skipped}题`} style={{background:`conic-gradient(#159c93 0 ${correct}%, #d98838 ${correct}% ${answered}%, #acbac8 ${answered}% 100%)`}}><div><strong>{total}</strong><span>本次题量</span></div></div><div><p>答对 {dist.correct} 题</p><p>答错 {dist.wrong} 题</p><p>未作答 {dist.skipped} 题</p></div></div></section>
    {report.interpretation && <section className={styles.panel}><h3>已生成的学习建议</h3><p>{report.interpretation}</p></section>}
    <section className={styles.panel}><h3>逐题作答与解析</h3>{report.evidence.map((q,i)=><details className={styles.evidence} key={q.id}><summary>{i+1}. {q.text} · {{correct:'答对',wrong:'答错',skipped:'未作答'}[q.state]}</summary><QuestionDiagram diagram={q.diagram} /><p>{Object.entries(q.options).map(([k,v])=>`${k}. ${v}`).join('　')}</p><p>学生选择：{q.chosen || '未作答'}；参考答案：{q.answer}</p><p>{q.explanation}</p></details>)}</section>
  </div>;
}
