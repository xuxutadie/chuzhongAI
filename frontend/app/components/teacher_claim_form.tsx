"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { teacherPost, type LinkReceipt } from "../teacher/api";
import styles from "../teacher/teacher.module.css";
import {captureEducation} from '../education/context_model';
import {HistoryInvite} from '../education/history_invite';

export function TeacherClaimForm() {
  return captureEducation().enabled?<HistoryInvite/>:<LegacyClaimForm/>;
}
function LegacyClaimForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef<{ code: string; id: string } | null>(null);
  return <section className={`${styles.card} ${styles.claim}`}><h2>认领学生</h2>
    <p>请学生在「学习档案 → 我的老师」生成认领码，再通过可靠渠道发给你。请先核对学生本人及学校班级。</p>
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault(); if (pending.current) return;
      const normalized = code.toUpperCase().replace(/[-\s]/g, "");
      if (!/^[A-HJ-NP-Z2-9]{12}$/.test(normalized)) { setError("请填写完整的 12 位认领码。"); return; }
      if (request.current?.code !== normalized) request.current = { code: normalized, id: crypto.randomUUID() };
      pending.current = true; setBusy(true); setError("");
      try {
        const receipt = await teacherPost<LinkReceipt>("claims", { code: normalized, request_id: request.current.id });
        setCode(""); request.current = null;
        router.push(`/teacher/students/${receipt.student_id}`);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "认领失败，请重试。"); }
      finally { pending.current = false; setBusy(false); }
    }}>
      <label>学生认领码<input value={code} onChange={event => setCode(event.target.value)} placeholder="XXXX-XXXX-XXXX" maxLength={20} autoComplete="off" required disabled={busy} /></label>
      <div className={styles.actions}><button className={styles.primary} disabled={busy} type="submit">{busy ? "正在认领…" : "认领并查看学情"}</button><span className={styles.muted}>30 分钟内有效 · 单次使用</span></div>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </form>
  </section>;
}
