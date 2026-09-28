"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { diagnosisApi, emptyFields, needsSchoolSupplement, type DiagnosisState, type ProfileFields, type Profile } from "./model";
import { ProfileEditor } from "./profile_editor";
import { useStudentSession } from "../components/student_session_provider";
import styles from "./diagnosis.module.css";

export function DiagnosisProfileCard() {
  const { user } = useStudentSession();
  return user ? <Editor key={user.id} /> : null;
}
function Editor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [value, setValue] = useState<ProfileFields>(emptyFields);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    diagnosisApi<DiagnosisState>("", undefined, "GET", controller.signal).then(data => {
      if (!controller.signal.aborted) { setProfile(data.profile); setValue({ ...emptyFields, ...data.profile.fields }); }
    }).catch(reason => { if (!controller.signal.aborted) setMessage(reason.message); });
    return () => controller.abort();
  }, []);
  return <section className={`${styles.panel} ${styles.report}`}><h2>我的数学学习档案</h2><p>这些资料由你填写。修改不会改变已交卷报告中的档案快照。</p>
    {profile?.confirmed ? <form onSubmit={async event => {
      event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
      try {
        const supplement = needsSchoolSupplement(profile);
        const saved = supplement
          ? await diagnosisApi<Profile>("/profile/school", { school_name: value.school_name, class_name: value.class_name, revision: profile.revision }, "PATCH")
          : await diagnosisApi<Profile>("/profile", { fields: value, confirmed: true, revision: profile.revision }, "PUT");
        setProfile(saved); setValue({ ...emptyFields, ...saved.fields }); setMessage("档案已保存，已有报告不会被改写。");
      }
      catch (reason) { setMessage(reason instanceof Error ? reason.message : "保存失败，请重试。"); }
      finally { setBusy(false); }
    }}>{needsSchoolSupplement(profile) ? <><p>先补充学校和班级，其余访谈资料、测评和学习进度保持不变。</p><div className={styles.formGrid}>
      <label>学校全称（或暂未入学）<input required maxLength={100} value={value.school_name} onChange={event=>setValue({...value,school_name:event.target.value})}/></label>
      <label>班级（或待分班）<input required maxLength={40} value={value.class_name} onChange={event=>setValue({...value,class_name:event.target.value})}/></label>
    </div></> : <ProfileEditor value={value} onChange={setValue} />}<button className={styles.primary} type="submit" disabled={busy}>{busy ? "正在保存…" : needsSchoolSupplement(profile) ? "只保存学校和班级" : "保存档案修改"}</button></form> : <Link href="/onboarding">继续首次建档</Link>}
    <p role="status">{message}</p><Link href="/onboarding">继续测评流程 →</Link>
  </section>;
}
