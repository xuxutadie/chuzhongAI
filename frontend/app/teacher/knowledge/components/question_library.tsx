import {useState} from 'react';
import {blankQuestion,knowledgeRequest,save,useAction,useResource} from '../api';
import type {Item,Page,Question} from '../types';
import {QuestionEditor} from './question_editor';
import {Feedback,Pagination} from './common';
import styles from '../knowledge.module.css';
export function QuestionLibrary({owner,revision,onChange}:{owner:number;revision:number;onChange:()=>void}){
  const [search,setSearch]=useState(''),[status,setStatus]=useState(''),[difficulty,setDifficulty]=useState(''),[archived,setArchived]=useState(false),[offset,setOffset]=useState(0),[editor,setEditor]=useState<Item<Question>|null|undefined>(undefined),[selected,setSelected]=useState<string[]>([]);
  const {data,error}=useResource<Page<Item<Question>>>(`questions?search=${encodeURIComponent(search)}&status=${status}&difficulty=${difficulty}&archived=${archived}&offset=${offset}`,revision);
  const action=useAction(onChange);
  return <div className={styles.stack}><section className={styles.card}><div className={styles.toolbar}><span className={styles.badge}>02 · 题目核对</span><h2>我的题库</h2><button className={styles.primary} onClick={()=>setEditor(null)}>＋ 手动录题</button></div>
    <div className={styles.row}><label>搜索题干<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label><label>审核状态<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">全部状态</option><option value="draft">待核对</option><option value="reviewed">已审核</option></select></label><label>难度<select value={difficulty} onChange={e=>{setDifficulty(e.target.value);setOffset(0);}}><option value="">全部难度</option><option value="regular">常规</option><option value="advanced">进阶</option><option value="challenge">挑战</option></select></label></div>
    <label className={styles.check}><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setOffset(0);setSelected([]);}}/>查看归档题目</label><Feedback error={error}/><Feedback {...action}/>
    {data?.total===0&&<p className={styles.empty}>{search||status||difficulty?'没有符合筛选条件的题目。':'还没有题目。上传试卷让 AI 整理，或从手动录题开始。'}</p>}
    {!data&&!error&&<p role="status">正在读取题库…</p>}
    <div className={styles.list}>{data?.items.map(item=><article className={styles.item} key={item.id}><div className={styles.toolbar}><span className={`${styles.badge} ${item.data.status==='reviewed'?styles.reviewed:''}`}>{item.data.status==='reviewed'?'已审核':'待核对'}</span><small>{{regular:'常规',advanced:'进阶',challenge:'挑战'}[item.data.difficulty]}</small>
      {!archived&&<label className={styles.check}><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>setSelected(selected.includes(item.id)?selected.filter(id=>id!==item.id):[...selected,item.id])}/>选择合并</label>}</div><h3>{item.data.prompt||'待补充题干'}</h3><small>{item.data.scope.grade?`${item.data.scope.grade}年级 · ${item.data.scope.edition}`:'尚未关联教材范围'}</small>
      <div className={styles.actions}><button disabled={action.busy} onClick={()=>void action.run(()=>save(`questions/${item.id}/${archived?'restore':'archive'}`,{expected_revision:item.revision}),archived?'已恢复':'已归档，保留历史题组引用')}>{archived?'恢复':'归档'}</button>{!archived&&<button className={styles.mint} onClick={()=>setEditor(item)}>核对 / 编辑 →</button>}</div></article>)}</div>
    {selected.length>1&&<button disabled={action.busy} onClick={()=>void action.run(async()=>{const parents=await Promise.all(selected.map(id=>knowledgeRequest<Item<Question>>(`questions/${id}`)));const versions=await Promise.all(parents.map(p=>knowledgeRequest<Item<Question>>(`question-versions/${p.data.current_version_id}`)));await save('questions/merge',{version_ids:versions.map(v=>v.id),expected_revisions:versions.map(v=>v.revision),content:{...blankQuestion,prompt:versions.map((v,i)=>`（${i+1}）${v.data.prompt}`).join('\n'),scope:versions[0].data.scope}});setSelected([]);},'已合成新草稿，原题均保留；请核对范围并补齐答案')}>合并所选 {selected.length} 道题为新草稿</button>}
    {data&&<Pagination total={data.total} offset={offset} onChange={setOffset}/>}</section>
    {editor!==undefined&&<QuestionEditor key={`${editor?.id||'new'}-${editor?.revision||0}`} owner={owner} item={editor} onChange={onChange} onClose={()=>setEditor(undefined)}/>}
  </div>;
}
