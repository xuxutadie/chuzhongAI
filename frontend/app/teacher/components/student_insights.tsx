"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentSession } from "../../components/student_session_provider";
import { teacherGet, teacherDelete, teacherBinaryUrl } from "../api";
import {captureEducation} from '../../education/context_model';
import { StudentApiError } from "../../student-api";
import { OverviewCard, statusLabels, type Overview, type AssessmentSummary, type LearningDay } from "./overview_card";
import { ReportSnapshot } from "./report_snapshot";
import { WrongQuestionSnapshot, type WrongQuestion } from "./wrong_question_snapshot";
import { QuestionDiagram } from "../../diagnosis/question_diagram";
import type { Report, Diagram } from "../../diagnosis/model";
import styles from "../teacher.module.css";

const sections = [['overview','学情概览'],['learning','每日学习'],['assessments','测评记录'],['wrong-questions','错题与巩固'],['reports','诊断报告']] as const;
type Section = typeof sections[number][0];
type Wrong = { id:number; question_text:string; stage?:string; created_at:string; knowledge_points?:string[] };
type WrongDetail = Wrong & { has_image:boolean; question: WrongQuestion & { diagram?:Diagram }; events:{ id:number; result:string; answer:unknown; source:string; occurred_at:string }[]; analysis_summary:string | null; error_reason:string | null; analysis:Record<string,unknown> | null; analysis_stale?:boolean };
type Detail = AssessmentSummary & { report?:Report | null };
const stepNames = ['课堂诊断','针对学习','过关测试','错题巩固','今日总结'];

export function StudentInsights({ studentId }: { studentId:number }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tab,setTab] = useState<Section>('overview');
  const [error,setError] = useState('');
  const [refresh,setRefresh] = useState(0);
  const [busy,setBusy] = useState(false);
  const router = useRouter();
  useEffect(()=>{
    const controller = new AbortController(); setOverview(null); setError('');
    teacherGet<Overview>(`linked-students/${studentId}`,controller.signal).then(value=>{if(!controller.signal.aborted)setOverview(value);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return ()=>controller.abort();
  },[studentId,refresh]);
  useEffect(()=>{
    const focus=()=>setRefresh(n=>n+1);
    window.addEventListener('focus',focus);
    return ()=>window.removeEventListener('focus',focus);
  },[]);
  function failed(reason:unknown) {
    if (reason instanceof StudentApiError && reason.status === 404) { setOverview(null); setError('关联已解除或记录不可访问。'); }
  }
  if(!overview) return <section className={styles.section}><Link href="/teacher/students">← 我的学生</Link><div className={styles.card}><p role={error?'alert':'status'}>{error||'正在读取学情…'}</p>{error&&<button onClick={()=>setRefresh(n=>n+1)}>重试读取</button>}</div></section>;
  return <div className={styles.section}><div className={styles.actions}><Link className={styles.secondary} href="/teacher/students">← 我的学生</Link><button className={styles.danger} disabled={busy} onClick={async()=>{
    if(!window.confirm('解除学情关联？学生学习记录不会删除，已下载的文件无法追回。'))return;
    setBusy(true);
    try { await teacherDelete(`links/${overview.link_id}`); setOverview(null); router.replace('/teacher/students'); }
    catch(reason){failed(reason);setError(reason instanceof Error?reason.message:'解除失败，请重试。');}
    finally{setBusy(false);}
  }} hidden={captureEducation().enabled}>解除学情关联</button></div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <nav className={styles.tabs} aria-label="学生学情分区">{sections.map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='overview'?<><OverviewCard value={overview}/><section className={styles.card}><h2>今日学习</h2>{overview.today?<Day value={overview.today}/>:<p>今天尚未开始五步任务。</p>}</section></>:<History key={`${tab}-${refresh}`} kind={tab} studentId={studentId} onDenied={failed}/>}
  </div>;
}
function Day({value}:{value:LearningDay}) {
  return <article><h3>{value.date}</h3><ol>{value.steps.map(step=><li key={step.step}>{stepNames[step.step-1]}：{statusLabels[step.status]||step.status}</li>)}</ol></article>;
}
function History({kind,studentId,onDenied}:{kind:Exclude<Section,'overview'>;studentId:number;onDenied:(reason:unknown)=>void}) {
  const [data,setData]=useState<{items:(AssessmentSummary|LearningDay|Wrong)[];total:number}|null>(null);
  const [offset,setOffset]=useState(0);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const [selected,setSelected]=useState<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController(); setData(null);setError('');setSelected(null);
    teacherGet<{items:(AssessmentSummary|LearningDay|Wrong)[];total:number}>(`linked-students/${studentId}/history?kind=${kind}&offset=${offset}&limit=20`,controller.signal)
      .then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(reason=>{if(!controller.signal.aborted){setError(reason.message);onDenied(reason);}});
    return ()=>controller.abort();
  },[kind,studentId,offset,retry]);
  if(error)return <p role="alert" className={styles.error}>{error}<button onClick={()=>setRetry(n=>n+1)}>重试</button></p>;
  if(!data)return <p role="status">正在读取记录…</p>;
  return <section className={styles.card}><h2>{sections.find(([id])=>id===kind)?.[1]}</h2>{kind==='learning'&&<p>{captureEducation().enabled?'授权范围内的全部已有学习记录，按时间分页展示。':'近 7 天已有任务记录；未开始的日期不计入。'}</p>}
    {!data.total?<p>这个分区暂时没有记录。</p>:<><ul className={styles.list}>{data.items.map(row=>{
      if('steps' in row)return <li key={row.date}><Day value={row}/></li>;
      if('question_text' in row)return <li className={styles.row} key={row.id}><div><strong>{row.question_text}</strong><p>{row.knowledge_points?.join('、')||'知识点待整理'} · {statusLabels[row.stage||'']||row.stage||'待核实'}</p></div><button className={styles.secondary} onClick={()=>setSelected(String(row.id))}>查看错题与重做记录</button></li>;
      return <li className={styles.row} key={row.id}><div><strong>{row.created_at.slice(0,10)} · {statusLabels[row.status]}</strong><p>{row.score===null?'尚未交卷，不显示作答和答案':`${row.score} / 100 分`}</p></div>{row.status==='submitted'&&<button className={styles.secondary} onClick={()=>setSelected(row.id)}>查看报告与解析</button>}</li>;
    })}</ul><div className={styles.actions}><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-20))}>上一页</button><span>共 {data.total} 条</span><button disabled={offset+20>=data.total} onClick={()=>setOffset(n=>n+20)}>下一页</button></div></>}
    {selected&&<RecordDetail key={selected} studentId={studentId} recordId={selected} isWrong={kind==='wrong-questions'} onDenied={onDenied}/>}
  </section>;
}
function RecordDetail({studentId,recordId,isWrong,onDenied}:{studentId:number;recordId:string;isWrong:boolean;onDenied:(reason:unknown)=>void}) {
  const {user}=useStudentSession();
  const [value,setValue]=useState<WrongDetail|Detail|null>(null);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const path=`linked-students/${studentId}/${isWrong?'wrong-questions':'assessments'}/${recordId}`;
  useEffect(()=>{
    const controller=new AbortController();setValue(null);setError('');
    teacherGet<WrongDetail|Detail>(path,controller.signal).then(data=>{if(!controller.signal.aborted)setValue(data);})
      .catch(reason=>{if(!controller.signal.aborted){setError(reason.message);onDenied(reason);}});
    return ()=>controller.abort();
  },[path,retry]);
  if(error)return <p role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试</button></p>;
  if(!value)return <p role="status">正在读取详情…</p>;
  if('question_text' in value)return <section className={styles.section}><h3>{value.question_text}</h3><QuestionDiagram diagram={value.question.diagram}/>
    {value.has_image&&user&&<a className={styles.secondary} href={teacherBinaryUrl(path+'/image',user.id)} target="_blank" rel="noreferrer">查看学生原图</a>}
    <p>已有分析：{value.analysis_summary||value.error_reason||'尚未完成分析'}</p>{value.analysis&&<details><summary>查看已有 AI 分析{value.analysis_stale?'（早于最新作答）':''}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(value.analysis,null,2)}</pre></details>}
    <WrongQuestionSnapshot question={value.question} events={value.events}/>
  </section>;
  return value.report&&user?<section className={styles.section}><a className={styles.primary} href={teacherBinaryUrl(path+'/pdf',user.id)} download>下载已有诊断 PDF</a><ReportSnapshot report={value.report}/></section>:<p>测评未交卷，暂不展示作答与答案。</p>;
}
