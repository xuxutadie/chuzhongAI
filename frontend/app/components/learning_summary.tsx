"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { learningGet,learningPost,actionId } from '../learning-route/api';
import type { LearningRoute,ReviewGroup } from '../learning-route/types';
import styles from '../learning-route/route.module.css';
type Summary={route:LearningRoute;groups:ReviewGroup[];resolved:number;needs_help:number};
export function LearningSummary(){
  const [data,setData]=useState<Summary|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;learningGet<Summary>('/summary').then(x=>{if(active)setData(x)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  async function finish(){if(!data)return;setBusy(true);try{const route=await learningPost<LearningRoute>('/route/steps/5/complete',{request_id:actionId(),revision:data.route.revision});setData({...data,route})}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}}
  return <main className={styles.page}><p className={styles.muted}>第 5 步 · 今日总结</p><h1>{data?.route.current_step===null?'今天完成了':'看看今天的收获'}</h1>
    {error?<p role="alert" className={styles.alert}>{error}</p>:null}
    {data?<section className={styles.panel}><div className={styles.stats}><div><strong>{data.resolved}</strong>本次巩固通过</div><div><strong>{data.needs_help}</strong>仍需帮助或核实</div></div>
      <p>课堂诊断、针对学习和过关记录已保存。做对的错题不会删除，之后会按间隔安排复习。</p>
      {data.groups.length===0?<p>今天没有需要安排的错题巩固。</p>:null}
      <div className={styles.actions}>{data.route.current_step!==null?<button className={styles.button} disabled={busy} onClick={()=>void finish()}>{busy?'正在保存…':'完成今天的学习'}</button>:<Link className={styles.button} href="/dashboard">返回学习首页</Link>}<Link className={styles.secondary} href="/wrong-questions">回看错题集</Link></div>
    </section>:!error?<p role="status">正在读取今日总结…</p>:<Link href="/dashboard">返回当前学习步骤</Link>}
  </main>;
}
