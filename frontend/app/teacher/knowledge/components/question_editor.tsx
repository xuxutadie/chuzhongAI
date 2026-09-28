import {educationBinaryUrl} from '../../../education/context_model';
import {useState} from 'react';
import {blankQuestion,knowledgeRequest,save,useAction,useResource,useCollection} from '../api';
import type {FileData,Item,Page,Question} from '../types';
import {canReviewQuestion} from '../state_model';
import {Feedback,ScopePicker,Sources} from './common';
import styles from '../knowledge.module.css';
import {GenerationSources} from './provenance';
export function QuestionEditor({owner,item,onChange,onClose}:{owner:number;item:Item<Question>|null;onChange:()=>void;onClose:()=>void}){
  const initial=item?.data||blankQuestion;
  const [q,setQ]=useState<Question>(()=>{const {status,checks,current_version_id,...content}=initial;return content;}),[parent,setParent]=useState(item),[version,setVersion]=useState<Item<Question>|null>(null),[confirmed,setConfirmed]=useState(false),[splitText,setSplitText]=useState(''),[dirty,setDirty]=useState(false);
  const files=useCollection<Item<FileData>>('files');const action=useAction(onChange);
  const change=(value:Partial<Question>)=>{setQ({...q,...value});setVersion(null);setConfirmed(false);setDirty(true);};
  return <section className={styles.card}><div className={styles.toolbar}><h2>{parent?'核对 / 编辑题目':'手动录题'}</h2><button onClick={onClose}>收起编辑</button></div>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(async()=>{const saved=await save<Item<Question>>('questions',{content:q,question_id:parent?.id??null,expected_revision:parent?.revision??null});setVersion(saved);setParent(await knowledgeRequest(`questions/${saved.parent_id}`));setConfirmed(false);setDirty(false);},'草稿已保存，请逐项核对后审核');}}><fieldset disabled={action.busy} className={styles.form}>
      <div className={styles.row}><label>题型<select value={q.response_type} onChange={e=>change({response_type:e.target.value as Question['response_type'],answer:{}})}><option value="single">单选题</option><option value="multiple">多选题</option><option value="boolean">判断题</option><option value="short">填空 / 简答</option><option value="worked">解答题</option></select></label><label>难度<select value={q.difficulty} onChange={e=>change({difficulty:e.target.value as Question['difficulty']})}><option value="regular">常规</option><option value="advanced">进阶</option><option value="challenge">挑战</option></select></label></div>
      <label>题干<textarea required maxLength={15000} value={q.prompt} onChange={e=>change({prompt:e.target.value})}/></label>
      {['single','multiple'].includes(q.response_type)&&<label>选项（每行一个，自动编号 A、B、C…）<textarea value={q.options.map(o=>o.text).join('\n')} onChange={e=>change({options:e.target.value.split('\n').map((text,i)=>({id:String.fromCharCode(65+i),text}))})}/></label>}
      {q.response_type==='boolean'?<label>参考答案<select value={q.answer.value===undefined?'':String(q.answer.value)} onChange={e=>change({answer:{value:e.target.value==='true'}})}><option value="">请选择</option><option value="true">正确</option><option value="false">错误</option></select></label>:<label>参考答案{q.response_type==='multiple'?'（选项编号用逗号分隔）':q.response_type==='single'?'（填写选项编号，如 A）':''}<input maxLength={3000} value={q.response_type==='multiple'?(q.answer.values||[]).join(','):String(q.answer.value??'')} onChange={e=>change({answer:q.response_type==='multiple'?{values:e.target.value.split(/[,，]/).map(v=>v.trim()).filter(Boolean)}:{value:e.target.value}})}/></label>}
      <label>解题思路与解析<textarea maxLength={15000} value={q.explanation} onChange={e=>change({explanation:e.target.value})}/></label>
      {q.response_type==='worked'&&<label>评分要点（每行一项）<textarea value={q.rubric.map(r=>r.point).join('\n')} onChange={e=>change({rubric:e.target.value.split('\n').filter(Boolean).map(point=>({point}))})}/></label>}
      <ScopePicker value={q.scope} onChange={scope=>change({scope})}/>
      <label className={styles.check}><input type="checkbox" checked={q.needs_figure} onChange={e=>change({needs_figure:e.target.checked})}/>本题需要图形，图中数据须与题干一致</label>
      <details><summary>配图（先在上传区本地提取图片）</summary><Feedback error={files.error}/>{files.data?.items.filter(f=>f.data.asset).map(f=><label className={styles.check} key={f.id}><input type="checkbox" checked={q.asset_ids.includes(f.id)} onChange={()=>change({asset_ids:q.asset_ids.includes(f.id)?q.asset_ids.filter(id=>id!==f.id):[...q.asset_ids,f.id]})}/>{f.data.title.slice(0,45)}</label>)}</details>
      {q.asset_ids.map(id=><img key={id} className={styles.picture} alt="题目配图" src={educationBinaryUrl(`/api/teacher/knowledge/files/${id}/download`,owner)}/>)}
      <button className={styles.primary} disabled={action.busy}>保存为待审核草稿</button>
    </fieldset></form>
    {q.sources.length>0&&<Sources sources={q.sources} owner={owner}/>}
    {(version?.id||parent?.data.current_version_id)&&<GenerationSources id={version?.id||parent!.data.current_version_id!} owner={owner}/>}
    {version&&<div className={styles.notice}><strong>{version.data.status==='reviewed'?'已审核':'待核对版本'}</strong>{version.data.checks?.map(issue=><p key={issue}>{issue}</p>)}<label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对答案与解析、知识范围、图文及尺寸一致性</label><button disabled={action.busy||!confirmed||!canReviewQuestion(version.data)||version.data.status==='reviewed'} onClick={()=>void action.run(async()=>{setVersion(await save(`question-versions/${version.id}/review`,{expected_revision:version.revision,confirmed_checks:['answer','scope','figure']}));setParent(await knowledgeRequest(`questions/${parent!.id}`));},'已审核入库，可作为原题或变式参考')}>审核入库</button></div>}
    {dirty&&<p className={styles.hint}>有未保存修改，请先保存草稿，再审核当前内容。</p>}
    {parent&&!version&&!dirty&&<button disabled={action.busy} onClick={()=>void action.run(async()=>{const saved=await knowledgeRequest<Item<Question>>(`question-versions/${parent.data.current_version_id}`);const {status,checks,current_version_id,...content}=saved.data;setQ(content);setVersion(saved);setConfirmed(false);},'已载入待核对的保存版本')}>核对已保存版本</button>}
    {version&&<details><summary>拆分题目（保留原题）</summary><p className={styles.hint}>每道新题题干之间使用单独一行“---”；新题答案需分别核对补充。</p><textarea aria-label="拆分后的题干" value={splitText} onChange={e=>setSplitText(e.target.value)}/><button disabled={action.busy} onClick={()=>void action.run(()=>save(`question-versions/${version.id}/split`,{expected_revision:version.revision,children:splitText.split(/\n---\n/).filter(s=>s.trim()).map(prompt=>({...blankQuestion,prompt,scope:q.scope,difficulty:q.difficulty}))}),'已生成拆分草稿，原题保留')}>保存拆分草稿</button></details>}
    <Feedback {...action}/>
  </section>;
}
