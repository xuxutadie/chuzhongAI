"use client";
import { useEffect, useState } from "react";
import { StudentPageShell } from "../../components/student_page_shell";
import { teacherGet, teacherPost, teacherRoles, type TeacherProfile } from "../api";
import styles from "../teacher.module.css";

function ProfileForm() {
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [school, setSchool] = useState("");
  const [classes, setClasses] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, reload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    teacherGet<TeacherProfile>("profile", controller.signal).then(value => {
      if (!controller.signal.aborted) { setProfile(value); setSchool(value.school_name); setClasses(value.teaching_classes.join("、")); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [revision]);
  return <section className={styles.section}><div className={styles.card}><h2>任教信息</h2><p>这些信息由你填写，不代表学校认证。更新资料不会自动关联任何学生。</p>
    {!profile ? error ? <p role="alert">{error}<button onClick={() => reload(v => v + 1)}>重试</button></p> : <p role="status">正在读取资料…</p> : <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setError(""); setMessage("");
      try {
        const rows = [...new Set(classes.split(/[,，、\n]/).map(s => s.trim()).filter(Boolean))];
        if (!school.trim() || !rows.length || rows.length > 20 || rows.some(s => s.length > 40)) throw new Error("请填写学校及 1 至 20 个班级，每班不超过 40 字。");
        setProfile(await teacherPost<TeacherProfile>("profile", { school_name: school.trim(), teaching_classes: rows }, "PUT")); setMessage("任教资料已保存。");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
      finally { setBusy(false); }
    }}><label>学校全称<input value={school} required maxLength={100} onChange={event => setSchool(event.target.value)} /></label>
      <label>任教班级<input value={classes} required maxLength={840} onChange={event => setClasses(event.target.value)} /></label>
      <button className={styles.primary} disabled={busy}>{busy ? "正在保存…" : "保存任教资料"}</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}<p role="status">{message}</p>
    </form>}</div></section>;
}
export default function TeacherProfilePage() {
  return <StudentPageShell allowedRoles={teacherRoles} eyebrow="教师工作台" title="我的任教资料" description="让学生清楚地知道你是谁。"><ProfileForm /></StudentPageShell>;
}
