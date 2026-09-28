"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StudentPageShell } from "../../components/student_page_shell";
import { TeacherClaimForm } from "../../components/teacher_claim_form";
import { useStudentSession } from "../../components/student_session_provider";
import { teacherGet, teacherRoles } from "../api";
import { AdminStudentAccounts } from "../components/admin_student_accounts";
import styles from "../teacher.module.css";
import {captureEducation} from '../../education/context_model';
type Student = { id:number; display_name:string; school_name:string; class_name:string; grade:string; last_activity:string | null };

function Students() {
  const { user } = useStudentSession();
  const [result, setResult] = useState<{items:Student[];total:number} | null>(null);
  const [filter, setFilter] = useState({name:"",school:"",class_name:"",grade:""});
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError("");
    teacherGet<{items:Student[];total:number}>(`linked-students?${query}&offset=${offset}&limit=20`,controller.signal).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [query,offset,reload]);
  return <div className={styles.section}><TeacherClaimForm /><section className={styles.card}><h2>已授权学生</h2>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); setOffset(0); setQuery(new URLSearchParams(filter).toString()); setReload(n=>n+1); }}>
      <div className={styles.facts}>{([['name','学生称呼'],['school','学校'],['grade','年级'],['class_name','班级']] as const).filter(([key])=>!captureEducation().enabled||key==='name').map(([key,label]) => <label key={key}>{label}<input value={filter[key]} maxLength={key === 'school' ? 100 : key === 'grade' ? 24 : 40} placeholder={`筛选${label}`} onChange={event=>setFilter({...filter,[key]:event.target.value})} /></label>)}</div>
      <div className={styles.actions}><button className={styles.secondary}>筛选已关联学生</button><span className={styles.muted}>不会搜索或显示未授权学生</span></div>
    </form>
    {error ? <p role="alert" className={styles.error}>{error} <button onClick={()=>setReload(n=>n+1)}>重试</button></p> : !result ? <p role="status">正在读取学生…</p> : result.total === 0 ? <p>{query ? "没有符合筛选条件的已关联学生。" : (captureEducation().enabled?"当前学校身份尚无学生授权，请先发出邀请，让学生本人确认。":"还没有关联学生。请先让学生生成认领码，在上方认领第一位学生。")}</p> : <>
      <ul className={styles.list}>{result.items.map(student=><li className={styles.row} key={student.id}><div><h3>{student.display_name}</h3><p>{captureEducation().enabled?"全部历史只读授权":student.school_name || "学校待补充"} · {student.grade || "年级待补充"} · {student.class_name || "班级待补充"}</p><span className={styles.muted}>{student.last_activity ? `最近学习：${new Date(student.last_activity).toLocaleString('zh-CN')}` : "暂无已记录学习活动"}</span></div><Link className={styles.primary} href={`/teacher/students/${student.id}`}>查看学情 →</Link></li>)}</ul>
      <div className={styles.actions}><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-20))}>上一页</button><span>共 {result.total} 位 · 第 {Math.floor(offset/20)+1} 页</span><button disabled={offset+20>=result.total} onClick={()=>setOffset(n=>n+20)}>下一页</button></div>
    </>}
  </section>{user?.role === 'admin' && (captureEducation().enabled?<Link className={styles.secondary} href="/admin/accounts">前往平台账号管理 →</Link>:<details className={styles.card}><summary>管理员专用：账号开通与密码管理</summary><p>这里管理你创建的托管账号，与学情认领权限分别管理。</p><AdminStudentAccounts /></details>)}</div>;
}
export default function TeacherStudentsPage() {
  return <StudentPageShell allowedRoles={teacherRoles} eyebrow="教师工作台" title="我的学生" description="学生授权后，了解学习起点、日常进度与错题巩固情况。"><Students /></StudentPageShell>;
}
