"use client";
import { useEffect, useRef, useState } from "react";
import { requestJson } from "../student-api";
import { useStudentSession } from "./student_session_provider";
import styles from "../teacher/teacher.module.css";
import Link from 'next/link';
import {useEducationResource} from '../education/hooks';

type TeacherLink = { link_id: number; display_name: string; school_name: string; linked_at: string; source: string };
export function StudentTeacherLinks() {
  const { user } = useStudentSession();
  return user?.role === "student" ? <Links key={user.id} /> : null;
}
function Links() {
  const {data,error}=useEducationResource<{enabled:boolean}>('status');
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p role="status">正在读取教师授权功能…</p>;
  return data.enabled?<section className={styles.card}><h2>教师授权管理</h2><p>先核对教师身份和学校，再明确同意。加入学校不会自动授权。</p><Link className={styles.primary} href="/authorizations">查看邀请与管理授权 →</Link></section>:<LegacyLinks/>;
}
function LegacyLinks() {
  const [links, setLinks] = useState<TeacherLink[]>([]);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [revision, reload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    requestJson<TeacherLink[]>("/api/student/teacher-links", { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setLinks(data);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  async function action(work: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请重试。"); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={styles.section} aria-labelledby="my-teachers"><div className={`${styles.card} ${styles.claim}`}>
    <h2 id="my-teachers">我的老师</h2><p>把认领码交给你认识的老师，即授权老师查看你的学习资料、测评、报告和错题。你可以随时解除关联；已下载的文件无法追回。关联不会改变你的 AI 设置或费用归属。</p>
    <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void action(async () => {
      const value = await requestJson<{ code: string; expires_at: string }>("/api/student/teacher-links/code", { method: "POST" });
      setCode(value); setMessage("新认领码已生成，之前未使用的码已失效。");
    })}>生成认领码</button><button className={styles.secondary} disabled={busy || loading} onClick={() => reload(value => value + 1)}>刷新关联列表</button></div>
    {code && <><p>仅本页显示，请勿公开发布。有效至 {new Date(code.expires_at).toLocaleString("zh-CN")}</p><output className={styles.code}>{code.code.match(/.{1,4}/g)?.join("-")}</output>
      <button className={styles.secondary} onClick={() => void action(async () => { try { await navigator.clipboard.writeText(code.code); } catch { throw new Error("浏览器未允许复制，请手动选中上方认领码复制。"); } setMessage("已复制。请只发给你认识的老师。"); })}>复制认领码</button></>}
    {message && <p role="status">{message}</p>}{error && <p role="alert" className={styles.error}>{error}<button onClick={() => reload(value => value + 1)}>重试读取</button></p>}
    {loading ? <p role="status">正在读取已关联老师…</p> : links.length ? <ul className={styles.list}>{links.map(link => <li className={styles.row} key={link.link_id}>
      <div><strong>{link.display_name}</strong><p>{link.school_name || "学校待补充"} · 学校为老师自填</p></div>
      <button className={styles.danger} disabled={busy} onClick={() => {
        if (!window.confirm(`解除与“${link.display_name}”的学情关联？学习记录仍会保留。`)) return;
        void action(async () => { await requestJson(`/api/student/teacher-links/${link.link_id}`, { method: "DELETE" }); setLinks(rows => rows.filter(row => row.link_id !== link.link_id)); setMessage("已解除学情关联。原账号管理员的密码管理权限不受此操作影响。"); });
      }}>解除关联</button>
    </li>)}</ul> : !error && <p>你还没有关联老师。先核对老师身份，再分享认领码。</p>}
  </div></section>;
}
