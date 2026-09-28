import {useState} from 'react';
import {knowledgeRequest,useResource,useAction} from '../api';
import type {Item,Page,Question,Source} from '../types';
import {Feedback,Sources} from './common';
import styles from '../knowledge.module.css';
type Provenance={kind:string;reference_ids:string[];sources:Source[];model:string;revised_from?:string};
export function GenerationSources({id,owner}:{id:string;owner:number}){
  const {data,error}=useResource<Page<Item<Provenance>>>(`sources?parent_id=${id}`);
  const [original,setOriginal]=useState<Item<Question>|null>(null),action=useAction();
  if(!data?.items.length)return error?<Feedback error={error}/>:null;
  return <details><summary>变式来源与参考题对照</summary><div className={styles.stack}>{data.items.map(s=><div className={styles.item} key={s.id}><p>{s.data.kind==='fill'?'依据教材生成':`基于 ${s.data.reference_ids.length} 道参考题生成变式`} · 模型：{s.data.model}</p>{s.data.revised_from&&<p className={styles.hint}>此题经过人工修订，保留原始生成来源。</p>}<div className={styles.actions}>{s.data.reference_ids.map((ref,i)=><button key={ref} disabled={action.busy} onClick={()=>void action.run(async()=>setOriginal(await knowledgeRequest(`question-versions/${ref}`)),'已载入参考题版本')}>参考题 {i+1}</button>)}</div><Sources sources={s.data.sources} owner={owner}/></div>)}</div>
    <Feedback {...action}/>{original&&<div className={styles.excerpt}><strong>原参考题（生成当时的版本）</strong><p>{original.data.prompt}</p><p>原题答案：{original.data.answer.values?.join('、')??String(original.data.answer.value??'')}</p><p>{original.data.explanation}</p></div>}
  </details>;
}
