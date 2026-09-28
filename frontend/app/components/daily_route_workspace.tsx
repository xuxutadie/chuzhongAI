"use client";
import { useCallback,useEffect,useState } from 'react';
import Link from 'next/link';
import { learningGet,learningPost,actionId } from '../learning-route/api';
import { STEP_TITLES } from '../learning-route/model.js';
import type { Activity,LearningRoute } from '../learning-route/types';
import { LearningQuestion } from './learning_question';
import { DailyWrongReview } from './daily_wrong_review';
import { LearningSummary } from './learning_summary';
import styles from '../learning-route/route.module.css';

export function DailyRouteWorkspace({step}:{step:number}){
  const [activity,setActivity]=useState<Activity|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [answer,setAnswer]=useState<string|string[]>('');const [reflection,setReflection]=useState('');const [responses,setResponses]=useState<Record<string,string>>({});const [finished,setFinished]=useState(false);
  const load=useCallback(async()=>{const value=await learningGet<Activity>(`/route/steps/${step}`);setActivity(value);setFinished(['completed','not_required'].includes(value.route.steps[step-1].status));},[step]);
  useEffect(()=>{let active=true;learningGet<Activity>(`/route/steps/${step}`).then(value=>{if(active){setActivity(value);setFinished(['completed','not_required'].includes(value.route.steps[step-1].status));}}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[step]);
  async function run(action:()=>Promise<void>){setError('');setBusy(true);try{await action()}catch(e){setError(e instanceof Error?e.message:'保存失败，请重试')}finally{setBusy(false)}}
  async function complete(){if(!activity)return;await run(async()=>{
    const route=await learningPost<LearningRoute>(`/route/steps/${step}/complete`,{request_id:actionId(),revision:activity.route.revision,reflection,responses});
    setActivity({...activity,route});setFinished(true);
  });}
  const questions=activity?.questions??[];const current=questions.find(q=>!q.submitted);const submitted=questions.filter(q=>q.submitted).length;
  if(step===5)return <LearningSummary/>;
  return <main className={styles.page}>
    <header className={styles.heading}><div><p className={styles.muted}>今日学习 · 第 {step} / 5 步</p><h1>{STEP_TITLES[step-1]}</h1></div><Link href="/dashboard" className={styles.secondary}>学习首页</Link></header>
    {error?<div className={styles.alert}><p role="alert">{error}</p><button className={styles.secondary} disabled={busy} onClick={()=>void run(load)}>重新读取已保存进度（保留输入）</button></div>:null}
    {!activity?<div className={styles.panel}><p>{error?'当前内容尚未载入。':'正在读取已保存的学习进度…'}</p><button className={styles.secondary} onClick={()=>void run(load)}>重新读取</button></div>:null}
    {finished?<section className={styles.panel}><p className={styles.success}>本步已完成，记录已保存。</p><div className={styles.actions}><Link className={styles.button} href={`/today-learning?step=${step+1}`}>进入第 {step+1} 步 · {STEP_TITLES[step]}</Link></div></section>:null}
    {activity&&!finished&&(step===1||step===3)?<>
      <p className={styles.progress}>已答 {submitted} / {questions.length}<progress value={submitted} max={questions.length||1}/></p>
      {current?<section className={styles.panel} key={current.assignment_id}><LearningQuestion question={current} answer={answer} onAnswer={setAnswer} disabled={busy}/>
        <div className={styles.actions}><button className={styles.button} disabled={busy||answer.length===0} onClick={()=>void run(async()=>{
          await learningPost('/answers',{event_key:`route:${current.assignment_id}`,assignment_id:current.assignment_id,answer});setAnswer('');await load();
        })}>{busy?'正在保存…':'提交，下一题'}</button></div><p className={styles.muted}>作答会随账号保存，错题自动进入错题集。</p></section>:
      <section className={styles.panel}><h2>{step===1?'诊断完成，看看接下来学什么':'本轮题目已答完'}</h2>
        {step===3?<label className={styles.field}>用一句话说说学到了什么（至少 8 字）<textarea value={reflection} onChange={e=>setReflection(e.target.value)} maxLength={1000}/></label>:<p>第一步用于了解情况，不要求全部答对。</p>}
        <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>void complete()}>{step===1?'保存诊断，进入第二步':'核验过关，进入第四步'}</button>
        {step===3?<button className={styles.secondary} disabled={busy} onClick={()=>void run(async()=>{const next=await learningPost<Activity>('/route/retry-test',{request_id:actionId(),revision:activity.route.revision});setActivity(next);setAnswer('')})}>看过讲解后重新测试</button>:null}</div>
      </section>}
    </>:null}
    {activity&&(step===2||step===3)?<section className={styles.panel}><h2>{step===2?'把这几个关键点弄清楚':'需要时回看讲解'}</h2>{activity.guides.map(guide=><details key={guide.id} open={step===2}>
      <summary>{guide.title}</summary><ol>{guide.steps.map((text,i)=><li key={i}><p>{text}</p></li>)}</ol>
      {guide.pitfalls.map((text,i)=><p className={styles.muted} key={i}>{text}</p>)}
      <Link className={styles.secondary} href={`/interactive-lessons/${guide.lesson_id}?from=daily-route`} target="_blank">打开互动演示</Link>
      {step===2&&!finished?<label className={styles.field}>用自己的话记下一点理解（至少 8 字）<textarea value={responses[guide.id]??''} onChange={e=>setResponses({...responses,[guide.id]:e.target.value})} maxLength={1000}/></label>:null}
    </details>)}{step===2&&!finished?<div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>void complete()}>保存学习记录，进入第三步</button></div>:null}</section>:null}
    {activity&&step===4&&!finished?<DailyWrongReview onComplete={complete} busy={busy}/>:null}
  </main>;
}
