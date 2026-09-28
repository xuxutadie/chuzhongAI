import type { ProfileFields } from "../../diagnosis/model";
import styles from "../teacher.module.css";
export type AssessmentSummary = { id: string; status: "active" | "submitted"; created_at: string; submitted_at: string | null; score: number | null; priority: string[]; report_available?: boolean; report_notice?: string | null };
export type LearningDay = { date: string; steps: { step: number; status: string }[]; updated_at: string };
export type Overview = { student_id: number; link_id: number; profile: { display_name: string; fields: Partial<ProfileFields> }; latest_assessment: AssessmentSummary | null; today: LearningDay | null; last_activity: string | null };
export const statusLabels: Record<string,string> = { completed: "已完成", not_required: "无需进行", in_progress: "进行中", available: "可以开始", locked: "未解锁", active: "未交卷", submitted: "已交卷", pending_verification: "待核实", understand: "理解", identify: "辨识", transfer: "拓展", challenge: "挑战" };
export function OverviewCard({ value }: { value: Overview }) {
  const fields = value.profile.fields;
  return <section className={styles.card}><h2>{value.profile.display_name}的学情概览</h2>
    <dl className={styles.facts}>
      <div><dt>学校 / 班级</dt><dd>{fields.school_name || "学校待补充"} · {fields.class_name || "班级待补充"}</dd></div>
      <div><dt>年级与教材</dt><dd>{fields.grade || "年级待补充"} · {fields.textbook || "教材待补充"}</dd></div>
      <div><dt>最近一次系统测评</dt><dd>{value.latest_assessment ? (value.latest_assessment.report_notice || `${value.latest_assessment.score} / 100 分`) : "尚无已提交测评"}</dd></div>
      <div><dt>最近数学成绩（学生自述）</dt><dd>{fields.exam_score != null ? `${fields.exam_score} / ${fields.exam_total} 分` : "尚未填写"}</dd></div>
    </dl>
    <p>学习目标（学生自述）：{fields.goal || "尚未填写"}</p><p>最近活动：{value.last_activity ? new Date(value.last_activity).toLocaleString("zh-CN") : "暂无已记录学习活动"}</p>
    {value.latest_assessment && <p>测评建议优先回顾：{value.latest_assessment.priority.join("、") || "暂无建议"}。记录于 {value.latest_assessment.submitted_at?.slice(0,10)}。</p>}
    <p className={styles.muted}>仅展示已有记录，不以缺少记录推断学生能力。查看学情不会调用 AI 或推进学生任务。</p>
  </section>;
}
