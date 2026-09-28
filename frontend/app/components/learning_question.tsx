"use client";
import { QuestionDiagram } from '../diagnosis/question_diagram';
import { MathInteractionQuestion } from './math_interaction_question';
import type { Question } from '../learning-route/types';
import styles from '../learning-route/route.module.css';

export function LearningQuestion({question,answer,onAnswer,disabled=false}:{question:Question;answer:string|string[];onAnswer:(value:string|string[])=>void;disabled?:boolean}){
  const multiple=question.response_type==='multi-choice';
  return <><h2 className={styles.question}>{question.prompt}</h2>
    {question.diagram?<QuestionDiagram diagram={question.diagram}/>:null}
    {question.visual?<MathInteractionQuestion question={{id:question.id,knowledgePointId:question.knowledge_points?.[0]??'',capabilityTag:'',difficulty:'basic',responseType:'single-choice',prompt:question.prompt,correctAnswer:'',explanation:'',visual:question.visual,source:'local-reviewed'}} unavailableLabel="重新加载图形"/>:null}
    {question.response_type==='numeric'?<label className={styles.field}>你的答案<input value={typeof answer==='string'?answer:''} onChange={e=>onAnswer(e.target.value)} disabled={disabled} maxLength={60} placeholder="填写数值或分数，如 -5、1/2" autoComplete="off"/></label>:
      <fieldset disabled={disabled} style={{border:0,padding:0,margin:0}}><legend className={styles.muted}>{multiple?'可选择多个答案':'请选择一个答案'}</legend><div className={styles.options}>{question.options.map(option=><label className={styles.option} key={option.id}>
        <input type={multiple?'checkbox':'radio'} name={question.id} value={option.id} checked={multiple?Array.isArray(answer)&&answer.includes(option.id):answer===option.id}
          onChange={()=>{if(multiple){const current=Array.isArray(answer)?answer:[];onAnswer(current.includes(option.id)?current.filter(x=>x!==option.id):[...current,option.id]);}else onAnswer(option.id)}}/>
        <span>{option.text}</span></label>)}</div></fieldset>}
  </>;
}
