"use client";
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { learningGet,learningPost } from '../learning-route/api';
import { STAGE_LABELS } from '../learning-route/model.js';
import type { CollectionItem } from '../learning-route/types';
import styles from '../learning-route/route.module.css';
const SOURCES:Record<string,string>={transition:'衔接测评',classroom:'课堂练习',self_check:'自查练习',history:'历史练习',photo:'拍照上传',manual:'手动录入'};
type Page={items:CollectionItem[];total:number;counts:Record<string,number>};
type Backfill={added:number;existing:number;pending:number;unrecoverable:number;next_cursor:string|null};
export function WrongCollectionList(){
  const [page,setPage]=useState<Page|null>(null);const [source,setSource]=useState('');const [stage,setStage]=useState('');const [point,setPoint]=useState('');const [offset,setOffset]=useState(0);const [reload,setReload]=useState(0);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [cursor,setCursor]=useState<string|null>(null);
  useEffect(()=>{let active=true;setPage(null);const query=new URLSearchParams({limit:'20',offset:String(offset)});if(source)query.set('source',source);if(stage)query.set('stage',stage);if(point)query.set('knowledge_point',point);
    learningGet<Page>(`/collection?${query}`).then(x=>{if(active)setPage(x)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[source,stage,point,offset,reload]);
  async function backfill(){setBusy(true);setError('');try{const result=await learningPost<Backfill>('/collection/backfill',{cursor,limit:200});setCursor(result.next_cursor);setNotice(`本批新增 ${result.added} 道，已存在 ${result.existing} 道，待核实 ${result.pending} 道。${result.unrecoverable?'部分历史题目无法可靠恢复，未伪造记录。':''}${result.next_cursor?'还有历史记录可继续补收。':'本轮补收完成。'}`);setReload(x=>x+1)}catch(e){setError(e instanceof Error?e.message:'补收失败')}finally{setBusy(false)}}
  return <section className={styles.page}><header className={styles.heading}><div><p className={styles.muted}>系统练习 · 拍照上传 · 手动录入</p><h1>我的错题集</h1></div><div className="workspace-action-group"><Link className="workspace-button" href="/wrong-questions/add">＋ 添加错题</Link><Link className="workspace-button secondary" href="/wrong-questions/review">今日错题复习 →</Link></div></header>
    <p className={styles.muted}>新错题自动收集。原题、错答与订正记录都会保留，不因一次答对而删除。</p>
    <div className={styles.filters}><label>来源 <select value={source} onChange={e=>{setSource(e.target.value);setOffset(0)}}><option value="">全部来源</option>{Object.entries(SOURCES).map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
      <label>状态 <select value={stage} onChange={e=>{setStage(e.target.value);setOffset(0)}}><option value="">全部阶段</option>{Object.entries(STAGE_LABELS).filter(([key])=>key!=='challenge').map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>
      <label>知识点 <input value={point} onChange={e=>{setPoint(e.target.value);setOffset(0)}} placeholder="输入完整知识点名称"/></label></div>
    {error?<p role="alert" className={styles.alert}>{error}</p>:null}{notice?<p role="status" className={styles.success}>{notice}</p>:null}
    <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={()=>void backfill()}>{busy?'正在补收…':cursor?'继续补收下一批':'补收历史错题'}</button><button className={styles.secondary} onClick={()=>{setError('');setReload(x=>x+1)}}>刷新列表</button></div>
    {!page?<p role="status">正在读取错题…</p>:<div className={styles.panel}><p className={styles.muted}>共 {page.total} 道 · 当前筛选结果</p>
      {!page.items.length?<p>暂时没有符合条件的错题。你可以补收历史测试，或点击“添加错题”录入题目。</p>:<ul className={styles.list}>{page.items.map(q=><li key={q.id}><span className={styles.tag}>{SOURCES[q.source]??q.source}</span><span className={styles.tag}>{STAGE_LABELS[q.stage]??q.stage}</span><h2>{q.question_text}</h2><p className={styles.muted}>累计错答 {q.wrong_count} 次{q.last_wrong_at?` · 最近 ${q.last_wrong_at.slice(0,10)}`:''}</p><div className={styles.actions}><Link className={styles.secondary} href={`/wrong-questions/${q.id}`}>查看并继续</Link><Link className="workspace-text-link" href={`/wrong-questions/${q.id}/edit`}>修改或删除</Link></div></li>)}</ul>}
      <div className={styles.actions}><button className={styles.secondary} disabled={offset===0} onClick={()=>setOffset(x=>Math.max(0,x-20))}>上一页</button><button className={styles.secondary} disabled={offset+20>=page.total} onClick={()=>setOffset(x=>x+20)}>下一页</button></div>
    </div>}
  </section>;
}
