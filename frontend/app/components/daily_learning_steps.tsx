"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStudentSession } from './student_session_provider';
import { useLearningProgress } from './learning_progress_provider';
import { CourseContextSelector } from './course_context_selector';
import { LearningRouteMap } from './learning_route_map';
import { learningGet,learningPost,actionId } from '../learning-route/api';
import type { LearningRoute } from '../learning-route/types';
import styles from '../learning-route/route.module.css';

export function DailyLearningSteps(){
  const router=useRouter();const {user}=useStudentSession();const {courseContextRequired}=useLearningProgress();
  const [route,setRoute]=useState<LearningRoute|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [reload,setReload]=useState(0);
  useEffect(()=>{let active=true;setRoute(null);setError('');
    learningGet<LearningRoute>('/route').then(value=>{if(active)setRoute(value)}).catch(e=>{if(active)setError(e.message)});
    return()=>{active=false};},[user?.id,reload]);
  async function open(step:number){setBusy(true);setError('');try{
    if(!route?.started){const started=await learningPost<LearningRoute>('/route/start',{request_id:actionId()});setRoute(started);}
    router.push(`/today-learning?step=${step}`);
  }catch(e){setError(e instanceof Error?e.message:'开始失败，请重试')}finally{setBusy(false)}}
  return <div className={styles.page}>
    <header className={styles.heading} data-tone="learning-sunshine"><div><p className={styles.muted}>今天的学习路线</p><h1>{route?.current_step===null?'今天完成了':'一步一步，完成今天的学习'}</h1><p className={styles.muted}>从当前这一步开始，完成后自动解锁下一步。</p></div><Link className={styles.secondary} href="/wrong-questions">我的错题集</Link></header>
    {error?<p role="alert" className={styles.alert}>{error} <button className={styles.secondary} onClick={()=>setReload(x=>x+1)}>重试</button></p>:null}
    {courseContextRequired?<CourseContextSelector required/>:null}
    <LearningRouteMap route={route} busy={busy} error={Boolean(error)} onOpen={step=>void open(step)} />
    <p className={styles.muted}>进度随账号保存。错题会自动收集，订正后也可以随时回看。</p>
  </div>;
}
