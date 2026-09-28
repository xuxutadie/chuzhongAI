import {educationBinaryUrl} from '../../../education/context_model';
import {useState} from 'react';
import {blankScope,knowledgeRequest,save,useAction,useResource,useCollection} from '../api';
import type {Item,Page,Question,SetData} from '../types';
import {Feedback,ScopePicker,Sources} from './common';
import styles from '../knowledge.module.css';
import {GenerationSources} from './provenance';
type Preview={group:Item<SetData>;questions:Item<Question>[];teacher_only:boolean;published:boolean};
export function QuestionSetPreview({owner,revision,onChange}:{owner:number;revision:number;onChange:()=>void}){
  const [scope,setScope]=useState(blankScope),[selected,setSelected]=useState<string[]>([]),[purpose,setPurpose]=useState('practice'),[preview,setPreview]=useState<Preview|null>(null);
  const sets=useCollection<Item<SetData>>('question-sets',revision),questions=useCollection<Item<Question>>('questions?status=reviewed',revision),action=useAction(onChange);
  const available=questions.data?.items.filter(q=>q.data.scope.grade===scope.grade&&q.data.scope.edition===scope.edition&&q.data.scope.semester===scope.semester&&q.data.scope.knowledge_point_ids.every(id=>scope.knowledge_point_ids.includes(id)))||[];
  return <section className={styles.card}><span className={styles.badge}>04 · 教师预览</span><h2>我的题组</h2><p className={styles.hint}>把已审核原题和变式组合起来。当前阶段仅保存、审核和预览，不会发布给学生，也不会改变学生学习进度。</p>
    <details><summary>＋ 从已审核题目建立题组</summary><form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(()=>save('question-sets',{scope,purpose,question_version_ids:selected}),'题组已保存，可预览并审核');}}>
      <ScopePicker value={scope} revision={revision} onChange={s=>{setScope(s);setSelected([]);}}/><label>用途<select value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="practice">练习</option><option value="test">测试</option></select></label>
      <fieldset><legend>已选 {selected.length} 道（最多 50 道）</legend>{available.map(q=><label key={q.id} className={styles.check}><input type="checkbox" checked={selected.includes(q.data.current_version_id!)} onChange={()=>setSelected(selected.includes(q.data.current_version_id!)?selected.filter(id=>id!==q.data.current_version_id):[...selected,q.data.current_version_id!])}/>{q.data.prompt.slice(0,100)}</label>)}</fieldset><button disabled={action.busy||selected.length<1||selected.length>50}>保存题组</button></form></details>
    <Feedback error={sets.error||questions.error}/><Feedback {...action}/>{sets.data?.total===0&&<p className={styles.empty}>尚未保存题组。先核对题库，再选择题目建立。</p>}
    <div className={styles.list}>{sets.data?.items.map(s=><div className={styles.item} key={s.id}><strong>{s.data.title} · {s.data.question_version_ids.length} 道</strong><small>{s.data.status==='reviewed'?'已审核':'待审核'} · 仅教师可见。题目有修订时，可显式更新组合，再次核对。</small><div className={styles.actions}><button disabled={action.busy} onClick={()=>void action.run(async()=>setPreview(await knowledgeRequest(`question-sets/${s.id}/preview`)),'已载入题组预览')}>查看试题和答案</button>
      <button disabled={action.busy} onClick={()=>void action.run(async()=>{
        const latest=[];for(const id of s.data.question_version_ids){const old=await knowledgeRequest<Item<Question>>(`question-versions/${id}`);const current=await knowledgeRequest<Item<Question>>(`questions/${old.parent_id}`);if(current.data.status!=='reviewed'||current.archived)throw Error('请先审核所有题目的当前版本，并恢复归档题目');latest.push(current.data.current_version_id);}
        await save('question-sets',{set_id:s.id,expected_revision:s.revision,purpose:s.data.purpose,scope:s.data.scope,question_version_ids:latest});setPreview(null);
      },'已换成当前已审核题目，题组退回草稿，请重新预览审核')}>更新为当前已审核题目</button>
      {s.data.status!=='reviewed'&&<button disabled={action.busy} onClick={()=>void action.run(()=>save(`question-sets/${s.id}/review`,{expected_revision:s.revision}),'题组已审核，尚未发布')}>审核题组</button>}</div></div>)}</div>
    {preview&&<section className={styles.stack}><div className={styles.toolbar}><h3>题组预览 · 仅教师可见</h3><button onClick={()=>setPreview(null)}>关闭预览</button></div>{preview.questions.map((q,i)=><article className={styles.item} key={q.id}><h3>{i+1}. {q.data.prompt}</h3>{q.data.options.map(o=><p key={o.id}>{o.id}. {o.text}</p>)}{q.data.asset_ids.map(id=><img alt="题目配图" className={styles.picture} key={id} src={educationBinaryUrl(`/api/teacher/knowledge/files/${id}/download`,owner)}/>)}<details><summary>答案与解析</summary><p>答案：{q.data.answer.values?.join('、')??String(q.data.answer.value??'待补充')}</p><p>{q.data.explanation}</p></details><Sources sources={q.data.sources} owner={owner}/><GenerationSources id={q.id} owner={owner}/></article>)}</section>}
  </section>;
}
