'use client';
import {useState} from 'react';
import {useAdminResource,adminAsset} from '../api';
import {LoadState,Pager} from './admin_shell';
import {ReadonlyBanner} from './readonly_banner';
import {useStudentSession} from '../../components/student_session_provider';
import {OverviewCard,statusLabels,type Overview,type LearningDay,type AssessmentSummary} from '../../teacher/components/overview_card';
import {ReportSnapshot} from '../../teacher/components/report_snapshot';
import {WrongQuestionSnapshot,type WrongQuestion} from '../../teacher/components/wrong_question_snapshot';
import {QuestionDiagram} from '../../diagnosis/question_diagram';
import type {Report,Diagram} from '../../diagnosis/model';
import type {Account,Page} from '../types';
const tabs=[['overview','学情概览'],['learning','每日学习'],['assessments','测评记录'],['wrong-questions','错题与巩固'],['reports','诊断报告']];
type Wrong={id:number;question_text:string;stage?:string;knowledge_points?:string[]};
type WrongDetail=Wrong&{has_image:boolean;question:WrongQuestion&{diagram?:Diagram};events:{id:number;result:string;answer:unknown;occurred_at:string}[];analysis_summary?:string;error_reason?:string};
export function AdminStudentInsights({id}:{id:number}){
  const [tab,setTab]=useState('overview'),[revision,setRevision]=useState(0);
  const {data,error}=useAdminResource<Overview&{account:Account}>(`views/students/${id}`,revision);
  return <><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<><ReadonlyBanner account={data.account} kind="student"/><nav className="admin-tabs" aria-label="学情分区">{tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>{tab==='overview'?<><OverviewCard value={data}/><section className="admin-panel"><h2>今日学习</h2>{data.today?<Day day={data.today}/>:<p>今天尚无已记录任务。</p>}</section></>:<History key={`${id}-${tab}`} id={id} kind={tab}/>}</>}</>;
}
function Day({day}:{day:LearningDay}){const names=['课堂诊断','针对学习','过关测试','错题巩固','今日总结'];return <div><h3>{day.date}</h3><ol>{day.steps.map(s=><li key={s.step}>{names[s.step-1]} · {statusLabels[s.status]||s.status}</li>)}</ol></div>;}
function History({id,kind}:{id:number;kind:string}){
  const [offset,setOffset]=useState(0),[selected,setSelected]=useState<string|null>(null),[revision,setRevision]=useState(0);
  const {data,error}=useAdminResource<Page<LearningDay|AssessmentSummary|Wrong>>(`views/students/${id}/history?kind=${kind}&offset=${offset}`,revision);
  return <><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<section className="admin-panel"><h2>{tabs.find(t=>t[0]===kind)?.[1]}</h2>{kind==='learning'&&<p>近 7 天已开始的任务记录；未开始的日期不计入。</p>}{!data.items.length?<p className="admin-empty">暂无记录，不代表学生没有掌握这些知识。</p>:<ul className="admin-list">{data.items.map(item=>{
    if('steps'in item)return <li key={item.date}><Day day={item}/></li>;
    if('question_text'in item)return <li key={item.id}><div><strong>{item.question_text}</strong><p>{item.knowledge_points?.join('、')||'知识点待整理'} · {statusLabels[item.stage||'']||'待核实'}</p></div><button onClick={()=>setSelected(String(item.id))}>查看错题</button></li>;
    return <li key={item.id}><div><strong>{item.created_at.slice(0,10)} · {statusLabels[item.status]}</strong><p>{item.report_notice || (item.score===null?'暂未提供成绩':`${item.score} / 100 分`)}</p></div>{item.status==='submitted'&&item.report_available!==false&&<button onClick={()=>setSelected(item.id)}>查看报告与解析</button>}</li>;
  })}</ul>}<Pager total={data.total} offset={offset} onChange={n=>{setOffset(n);setSelected(null);}}/></section>}{selected&&<Detail key={selected} id={id} recordId={selected} wrong={kind==='wrong-questions'}/>}</>;
}
function Detail({id,recordId,wrong}:{id:number;recordId:string;wrong:boolean}){
  const {user}=useStudentSession(),[revision,setRevision]=useState(0);
  const path=`views/students/${id}/${wrong?'wrong-questions':'assessments'}/${recordId}`;
  const {data,error}=useAdminResource<WrongDetail|(AssessmentSummary&{report?:Report})>(path,revision);
  return <section className="admin-panel"><h2>{wrong?'错题详情':'诊断报告'}</h2><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&('question_text'in data?<><h3>{data.question_text}</h3><QuestionDiagram diagram={data.question?.diagram}/>{data.has_image&&user&&<img className="admin-preview-image" alt="学生上传的错题" src={adminAsset(path+'/image',user.id)}/>}<p>{data.error_reason}</p><p>{data.analysis_summary}</p><WrongQuestionSnapshot question={data.question} events={data.events}/></>:data.report?<>{user&&<a className="admin-button" href={adminAsset(path+'/pdf',user.id)} target="_blank" rel="noreferrer">下载已有报告 PDF</a>}<ReportSnapshot report={data.report}/></>:<p>尚未交卷，不显示答案。</p>)}</section>;
}
