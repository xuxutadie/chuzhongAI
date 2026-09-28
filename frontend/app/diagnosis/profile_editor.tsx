"use client";
import { interviewFor, type ProfileFields } from "./model";
import styles from "./diagnosis.module.css";

export function ProfileEditor({ value, onChange }: { value: ProfileFields; onChange: (value: ProfileFields) => void }) {
  function update(key: keyof ProfileFields, entry: string) {
    onChange({ ...value, [key]: ["exam_score", "exam_total", "daily_minutes"].includes(key) ? entry === "" ? null : Number(entry) : entry });
  }
  return <div className={styles.formGrid}>
    {([ ["nickname", "称呼", 40], ["grade", "年级（六年级 / 升七年级 / 七年级）", 24], ["school_name", "学校全称（或暂未入学）", 100], ["class_name", "班级（或待分班）", 40], ["textbook", "数学教材与册次", 100],
      ["exam_score", "最近数学考试得分（可不填）", 8], ["exam_total", "那次考试的满分", 8], ["exam_date", "考试大致时间", 80],
      ["weak_topics", "需要帮助的内容", 400], ["goal", "我的学习目标", 400], ["daily_minutes", "每日学习分钟数（5–180）", 3] ] as const).map(([key, title, max]) =>
      <label key={key}>{title}<input value={value[key] ?? ""} maxLength={max} type={["exam_score", "exam_total", "daily_minutes"].includes(key) ? "number" : "text"}
        onChange={event => update(key, event.target.value)} /></label>)}
    <details className={styles.detailEditor}><summary>查看或修改学习习惯与访谈补充</summary><div className={styles.formGrid}>
    {interviewFor(value).filter(row => !(row.field in value) && row.field !== "exam").map(row => <label key={row.field}>{row.title}
      <input value={value.learning_details?.[row.field] ?? ""} maxLength={400} onChange={event => onChange({ ...value, learning_details: { ...value.learning_details, [row.field]: event.target.value } })} />
    </label>)}
    </div></details>
  </div>;
}
