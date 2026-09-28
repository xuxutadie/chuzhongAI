'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useAdminResource} from '../api';
import {ReadonlyBanner} from './readonly_banner';
import {LoadState,Pager} from './admin_shell';
import {KnowledgePreview,type KnowledgeItem} from './knowledge_preview';
import {stateLabels,type Account,type Page} from '../types';
const tabs=[['students','关联学生'],['textbooks','教材'],['chapters','章节'],['questions','题库'],['question-sets','题组']];
export function AdminTeacherInsights({id}:{id:number}){
  const [tab,setTab]=useState('students'),[revision,setRevision]=useState(0);
  const {data,error}=useAdminResource<{account:Account;school_name:string;teaching_classes:string[]}>(`views/teachers/${id}`,revision);
  return <><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<><ReadonlyBanner account={data.account} kind="teacher"/><section className="admin-panel"><h2>任教资料</h2><p>{data.school_name||'学校尚未填写'} · {data.teaching_classes.join('、')||'任教班级尚未填写'}</p></section><nav className="admin-tabs" aria-label="教师情况分区">{tabs.map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav><Collection key={`${id}-${tab}`} id={id} tab={tab}/></>}</>;
}
function Collection({id,tab}:{id:number;tab:string}){
  const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const path=`views/teachers/${id}/${tab==='students'?'students':'knowledge/'+tab}`;
  const {data,error}=useAdminResource<Page<Account|KnowledgeItem>>(path+'?offset='+offset,revision);
  return <><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<section className="admin-panel"><h2>{tabs.find(t=>t[0]===tab)?.[1]}</h2>{!data.items.length?<p className="admin-empty">这个分区暂无记录。</p>:<ul className="admin-list">{data.items.map(item=>'username'in item?<li key={item.id}><div><strong>{item.display_name}</strong><p>{item.username} · {stateLabels[item.state]}</p></div><Link className="admin-button" href={`/admin/view/students/${item.id}`}>查看学情</Link></li>:<li key={item.id}><strong>{String(item.data.title||item.data.prompt||'未命名资料')}</strong><button onClick={()=>setSelected(item.id)}>查看内容</button></li>)}</ul>}<Pager total={data.total} offset={offset} onChange={n=>{setOffset(n);setSelected(null);}}/></section>}{selected&&<Detail key={selected} path={path+'/'+selected}/>}</>;
}
function Detail({path}:{path:string}){const [revision,setRevision]=useState(0);const {data,error}=useAdminResource<KnowledgeItem>(path,revision);return <section className="admin-panel"><h2>资料内容 · 只读</h2><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<KnowledgePreview item={data}/>}</section>;}
