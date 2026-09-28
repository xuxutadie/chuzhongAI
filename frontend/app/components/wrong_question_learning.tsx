"use client";
import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { QuestionDiagram } from '../diagnosis/question_diagram';
import { learningGet,learningPost,actionId } from '../learning-route/api';
import { STAGE_LABELS } from '../learning-route/model.js';
import type { CollectionDetail,Practice,PracticeResult } from '../learning-route/types';
import { LearningQuestion } from './learning_question';
import styles from '../learning-route/route.module.css';
import { useStudentSession } from './student_session_provider';

type JobStatus={status:string;error:string|null;job_id:string;public_result:unknown};
export function WrongQuestionLearning({questionId,onUpdated}:{questionId:number;onUpdated?:()=>void}){
  const {user}=useStudentSession();
  return <WrongQuestionLearningContent key={`${user?.id}:${questionId}`} questionId={questionId} onUpdated={onUpdated}/>;
}
function WrongQuestionLearningContent({questionId,onUpdated}:{questionId:number;onUpdated?:()=>void}){
  const [detail,setDetail]=useState<CollectionDetail|null>(null);const [practice,setPractice]=useState<Practice|null>(null);
  const [answer,setAnswer]=useState('');const [result,setResult]=useState<PracticeResult|null>(null);const [notice,setNotice]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [jobId,setJobId]=useState<string|null>(null);
  const [jobKind,setJobKind]=useState<'analysis'|'generation'>('analysis');
  const mounted=useRef(true);
  const load=useCallback(async()=>{const value=await learningGet<CollectionDetail>(`/collection/${questionId}`);if(mounted.current)setDetail(value)},[questionId]);
  useEffect(()=>{mounted.current=true;void load().catch(e=>{if(mounted.current)setError(e.message)});return()=>{mounted.current=false}},[load]);
  useEffect(()=>{if(!jobId)return;let active=true;let timer:ReturnType<typeof setTimeout>;let polls=0;
    async function poll(){try{const status=await learningGet<JobStatus>(`/jobs/${jobId}`);if(!active)return;
      if(status.status==='completed'){setJobId(null);setNotice('整理结果已保存。');await load();
        if(jobKind==='generation'){
          const value=await learningPost<Practice>(`/collection/${questionId}/practice/next`,{request_id:actionId()});
          if(active){setPractice(value);setResult(null);setAnswer('');setNotice(value.message??'已生成并校验练习。')}
        }return}
      if(['failed','stale'].includes(status.status)){setJobId(null);setError(status.error??'作答依据已变化，请重新整理。');return}
      if(++polls>=60){setJobId(null);setNotice('任务仍在后台保存，可稍后回来看结果。');return}
      timer=setTimeout(()=>void poll(),2000);
    }catch(e){if(active){setJobId(null);setError(e instanceof Error?e.message:'读取分析失败')}}}
    void poll();return()=>{active=false;clearTimeout(timer)};
  },[jobId,jobKind,load,questionId]);
  async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'操作未保存，请重试')}finally{if(mounted.current)setBusy(false)}}
  async function next(challenge=false){await run(async()=>{
    const value=await learningPost<Practice>(`/collection/${questionId}/practice/next`,{request_id:actionId(),...(challenge?{stage:'challenge'}:{})});
    setPractice(value);setResult(null);setAnswer('');setNotice(value.message??'');if(value.status!=='ready')onUpdated?.();
  });}
  return <section>
    {error?<p className={styles.alert} role="alert">{error}</p>:null}
    {notice?<p className={styles.success} role="status">{notice}</p>:null}
    {!detail?<p role="status">正在读取原题与错答记录…</p>:<>
      <div className={styles.panel}><p className={styles.muted}>当前阶段 · {STAGE_LABELS[detail.stage]??detail.stage}</p><h2>{detail.question.prompt}</h2>
        {detail.has_image?<img className={styles.originalImage} src={`/api/student/wrong-questions/${questionId}/image`} alt="确认保存的原题图片"/>:null}
        {detail.question.diagram?<QuestionDiagram diagram={detail.question.diagram}/>:null}
        {detail.question.options?.length?<ul>{detail.question.options.map(o=><li key={o.id}>{o.id}：{o.text}</li>)}</ul>:null}
        <details><summary>当时怎么答的 · {detail.events.filter(e=>e.result==='wrong').length} 条错答记录</summary>
          <ul>{detail.events.map(e=><li key={e.id}>{e.result==='wrong'?'答错':e.result==='correct'?'答对':e.result==='skipped'?'跳过':'待核实'} · {typeof e.answer==='string'?e.answer:JSON.stringify(e.answer)} · {e.occurred_at.slice(0,10)}</li>)}</ul>
        </details>
        {detail.question.answer!=null?<details><summary>回看原题参考解法</summary><p>{detail.question.explanation}</p><p>原题参考答案：{String(detail.question.answer)}</p></details>:<p className={styles.muted}>原题答案待核实，不会用 AI 猜测代替可信判分。</p>}
      </div>
      <div className={styles.panel}><h2>理解这道错题</h2>
        {detail.analysis?<><p className={styles.muted}>{detail.analysis.mode==='rules'?'规则辅助 · AI 尚未配置':'AI 辅助分析 · 错因待确认'}{detail.analysis_stale?' · 有新作答，请更新整理':''}</p>
          {detail.analysis.observed_facts.map((fact,i)=><p key={i}>{fact}</p>)}
          {detail.analysis.possible_causes.map((cause,i)=><p key={i}>可能原因（{cause.confidence}）：{cause.claim}</p>)}
          <p>{detail.analysis.clarifying_question}</p><ul>{detail.analysis.hints.map((hint,i)=><li key={i}>{hint}</li>)}</ul><p>{detail.analysis.next_action}</p></>:
          <p>先比较自己的作答与原题解法，再通过一道检查题确认理解。AI 会依据真实作答整理，不把答错直接归因于粗心。</p>}
        <div className={styles.actions}><button className={styles.secondary} disabled={busy||!!jobId} onClick={()=>void run(async()=>{
          const job=await learningPost<JobStatus>(`/collection/${questionId}/jobs`,{request_id:actionId(),kind:'analysis'});setJobKind('analysis');setJobId(job.job_id);setNotice('正在根据作答证据整理，结果会随账号保存。');
        })}>{jobId?'AI 正在整理…':detail.analysis?'更新 AI 整理':'请 AI 整理错因'}</button>
        {!practice||practice.status!=='ready'?<button className={styles.button} disabled={busy||!!jobId} onClick={()=>void next()}>开始{STAGE_LABELS[detail.stage]??'理解检查'}</button>:null}
        {['variant','extension'].includes(detail.stage)&&(!practice||!!result)?<button className={styles.secondary} disabled={busy||!!jobId} onClick={()=>void run(async()=>{
          const job=await learningPost<JobStatus>(`/collection/${questionId}/jobs`,{request_id:actionId(),kind:'generation',stage:detail.stage});setJobKind('generation');setJobId(job.job_id);setNotice('AI 正在结合错题准备练习，通过答案校验后才会显示。未配置 AI 时使用审核题库。');
        })}>请 AI 准备下一题</button>:null}</div>
      </div>
      {practice?.status==='ready'?<div className={styles.panel}><p className={styles.muted}>{STAGE_LABELS[practice.stage]} · {practice.mode==='ai-validated'?'AI 变式 · 已核验':'审核模板练习'}</p>
        <LearningQuestion question={practice.question} answer={answer} onAnswer={value=>setAnswer(String(value))} disabled={busy||!!result}/>
        {result?<><p className={result.result==='correct'?styles.success:styles.alert} role="status">{result.result==='correct'?(result.independent?'本次订正通过':'借助提示完成，还需独立检查'):'这次还没答对，先回看关键步骤。'}</p><p>{result.explanation}</p>
          <div className={styles.actions}><button className={styles.button} disabled={busy} onClick={()=>void next()}>{result.needs_help?'查看下一步建议':'继续下一题'}</button><button className={styles.secondary} onClick={()=>onUpdated?.()}>返回今日进度</button></div></>:
          <div className={styles.actions}><button className={styles.button} disabled={busy||!answer.trim()} onClick={()=>void run(async()=>{
            const receipt=await learningPost<PracticeResult>(`/practice/${practice.item_id}/submit`,{request_id:`answer:${practice.item_id}`,revision:practice.revision,answer});setResult(receipt);await load();
          })}>{busy?'正在保存…':'提交答案'}</button>
          <button className={styles.secondary} disabled={busy} onClick={()=>void run(async()=>{const data=await learningPost<{hint:string}>(`/practice/${practice.item_id}/hint`,{request_id:actionId()});setNotice(data.hint)})}>看提示</button>
          <button className={styles.secondary} disabled={busy} onClick={()=>void run(async()=>{await learningPost(`/practice/${practice.item_id}/report-issue`,{request_id:actionId(),reason:'学生反馈题目或图形存在疑问'});setPractice(null);setNotice('已暂停本题判分，保留记录等待核实。');onUpdated?.()})}>题目有疑问</button></div>}
      </div>:null}
      {['extension','review','mastered'].includes(detail.stage)?<div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={()=>void next(true)}>可选拔高挑战</button><span className={styles.muted}>不影响今天完成，不清除基础进度。</span></div>:null}
      <p className={styles.muted}>原题与订正记录会一直保留在 <Link href="/wrong-questions">错题集</Link>。</p>
    </>}
  </section>;
}
