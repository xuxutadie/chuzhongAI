import Link from "next/link";
import { StudentPageShell } from "../components/student_page_shell";
import { DiagnosisReport } from "../diagnosis/report";

export default function ReportsPage() {
  return <StudentPageShell eyebrow="诊断报告" title="看见进步，找到方向" description="衔接测评帮助你了解学习起点；每日学习的收获在今日总结中查看。">
    <section className="report-context-bar" aria-label="报告类型">
      <div><strong>衔接测评报告</strong><span>六升七 · 能力分析与 PDF 下载。今日总结在完成每日前四步后查看。</span></div>
      <Link className="workspace-button secondary" href="/learning-summary">查看今日总结 <span aria-hidden="true">→</span></Link>
    </section>
    <DiagnosisReport />
  </StudentPageShell>;
}
