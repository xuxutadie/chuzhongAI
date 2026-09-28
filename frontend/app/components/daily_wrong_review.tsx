"use client";
import { useEffect,useState } from 'react';
import { learningGet,learningPost,actionId } from '../learning-route/api';
import type { DailyReview } from '../learning-route/types';
import { WrongQuestionLearning } from './wrong_question_learning';
import styles from '../learning-route/route.module.css';
export function DailyWrongReview({onComplete,busy=false,completionLabel='进入第五步 · 今日总结'}:{onComplete:()=>Promise<void>;busy?:boolean;completionLabel?:string}){
  const [review,setReview]=useState<DailyReview|null>(null);const [error,setError]=useState('');
  useEffect(()=>{let active=true;learningPost<DailyReview>('/review/start',{request_id:actionId()}).then(x=>{if(active)setReview(x)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
  const current=review?.groups.find(g=>!g.outcome);
  async function refresh(){try{setReview(await learningGet<DailyReview>('/review'))}catch(e){setError(e instanceof Error?e.message:'读取失败')}}
  return <>{error?<p role="alert" className={styles.alert}>{error}</p>:null}
    {!review?<p role="status">正在安排今天的错题…</p>:current?<><p className={styles.muted}>今天第 {review.groups.indexOf(current)+1} / {review.groups.length} 组 · 一次只做当前阶段</p><WrongQuestionLearning key={current.question_id} questionId={current.question_id} onUpdated={()=>void refresh()}/></>:
      <section className={styles.panel}><h2>{review.groups.length?'今天的错题已经处理完':'今天无需订正'}</h2><p>{review.groups.some(g=>!['passed','not_required'].includes(g.outcome??''))?'仍需帮助或核实的题已保留，不会标成掌握。':'本次记录已保存，之后会按间隔安排复习。'}</p><button className={styles.button} disabled={busy} onClick={()=>void onComplete()}>{completionLabel}</button></section>}
  </>;
}
