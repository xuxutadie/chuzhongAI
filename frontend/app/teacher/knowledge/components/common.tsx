import {educationBinaryUrl} from '../../../education/context_model';
import {useState} from 'react';
import {chapterScope,useResource,useCollection} from '../api';
import type {Chapter,Scope,Page,Item,FileData,Source} from '../types';
import styles from '../knowledge.module.css';
export function Feedback({error,message}:{error?:string;message?:string}){return <>{error&&<p role="alert" className={styles.error}>{error}</p>}{message&&<p role="status" className={styles.notice}>{message}</p>}</>;}
export function ScopePicker({value,onChange,revision=0}:{value:Scope;onChange:(s:Scope)=>void;revision?:number}){
  const {data,error}=useCollection<Item<Chapter>>('chapter-versions?status=reviewed',revision);
  return <div className={styles.stack}><label>出题范围 · 已审核教材章节<select value={value.chapter_version_ids[0]||''} onChange={e=>{const item=data?.items.find(c=>c.id===e.target.value);if(item)onChange(chapterScope(item));}}><option value="">请选择教材章节</option>{data?.items.map(c=><option key={c.id} value={c.id}>{c.data.edition} · {c.data.grade}年级{c.data.semester} · {c.data.title}</option>)}</select></label>
    {value.knowledge_point_ids.length>0&&<p className={styles.hint}>限定 {value.knowledge_point_ids.length} 个知识点；前置知识 {value.prerequisite_ids.length} 项。不会跨年级补题。</p>}
    {data?.total===0&&<p className={styles.hint}>请先到“教材”上传并审核章节，再回来选题。</p>}<Feedback error={error}/></div>;
}
export function FilePreview({file,owner}:{file:Item<FileData>;owner:number}){
  const [position,setPosition]=useState(0);const extracted=file.data.extraction,source=extracted?.sources[position];
  return <div className={styles.stack}><a className={styles.button} href={educationBinaryUrl(`/api/teacher/knowledge/files/${file.id}/download`,owner)} download>下载原件 · {file.data.title}</a>
    {extracted?<><label>原文位置<select value={position} onChange={e=>setPosition(Number(e.target.value))}>{extracted.sources.map((s,i)=><option key={s.index} value={i}>{extracted.index_kind==='paragraph'?'段落':'页'} {s.index}</option>)}</select></label>
      <div className={styles.excerpt}>{source?.text||'此位置为图片/扫描内容，请对照下方原图，人工补充文字或配置 OCR 后整理。'}</div>
      {!!source?.formulas?.length&&<p className={styles.error}>这里包含 {source.formulas.length} 个 Word 公式对象，普通文字提取不含这些公式。请下载原件核对并手动转写，或另存为 PDF 后重新上传。</p>}
      {!!source?.warnings?.length&&<p className={styles.hint}>需核对内容：{source.warnings.map(w=>w==='needs_ocr'?'需要 OCR':w==='verify_formula'?'公式需人工核对':w).join('、')}</p>}
      {source?.asset_refs.map(id=><img key={id} alt="资料原图，请核对题干和公式" className={styles.picture} src={educationBinaryUrl(`/api/teacher/knowledge/files/${id}/download`,owner)}/>)}</>:<p className={styles.hint}>尚未完成本地提取，请在上传处理区启动任务。</p>}</div>;
}
export function Sources({sources,owner}:{sources:Source[];owner:number}){
  const [selected,setSelected]=useState('');const {data,error}=useResource<Item<FileData>>(selected?`files/${selected}`:'files?limit=1');
  return <details><summary>原文来源（{sources.length} 处）</summary><div className={styles.actions}>{sources.map((s,i)=><button key={i} onClick={()=>setSelected(s.file_id)}>来源 {i+1} · {s.kind==='paragraph'?'段落':'页'} {s.index}</button>)}</div>
    {selected&&data?.id&&<FilePreview file={data} owner={owner}/>}<Feedback error={error}/></details>;
}
export function Pagination({total,offset,onChange}:{total:number;offset:number;onChange:(n:number)=>void}){return <div className={styles.pagination}><button disabled={!offset} onClick={()=>onChange(Math.max(0,offset-20))}>上一页</button><span>{Math.floor(offset/20)+1} / {Math.max(1,Math.ceil(total/20))}</span><button disabled={offset+20>=total} onClick={()=>onChange(offset+20)}>下一页</button></div>;}
