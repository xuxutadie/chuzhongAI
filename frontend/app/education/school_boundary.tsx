'use client';
import {useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import Link from 'next/link';
import {requestJson} from '../student-api';
import {captureEducation,configureEducation,selectEducation,educationRevision,subscribeEducation,type SchoolContext} from './context_model';
import styles from '../teacher/teacher.module.css';

export function useSchoolSelection(){
  useSyncExternalStore(subscribeEducation,educationRevision,()=>0);
  return captureEducation();
}
export function SchoolBoundary({owner,path,children}:{owner:number;path:string;children:ReactNode}){
  const [schools,setSchools]=useState<SchoolContext[]>([]),[readyOwner,setReadyOwner]=useState<number|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const snapshot=useSchoolSelection();
  useEffect(()=>{
    const controller=new AbortController();setError('');
    void (async()=>{
      const status=await requestJson<{enabled:boolean}>('/api/education/status',{signal:controller.signal});
      if(controller.signal.aborted)return;
      configureEducation(owner,status.enabled);
      if(status.enabled){
        const result=await requestJson<{items:SchoolContext[]}>('/api/education/me/spaces',{signal:controller.signal});
        if(controller.signal.aborted)return;
        const items=result.items.filter(item=>item.role==='teacher'||item.role==='school_admin');setSchools(items);
        let saved:string|null=null;
        try{saved=localStorage.getItem('education-school-'+owner);}catch{/* 禁用存储时仅在当前标签使用。 */}
        const previous=captureEducation().selected?.membership_id;
        selectEducation(items.find(item=>item.membership_id===(saved||previous))??(items.length===1?items[0]:null));
      }
      setReadyOwner(owner);
    })().catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[owner,reload]);
  useEffect(()=>{
    const focus=()=>setReload(n=>n+1);
    const storage=(event:StorageEvent)=>{
      if(event.key==='education-school-'+owner){selectEducation(schools.find(item=>item.membership_id===event.newValue)??null);}
    };
    window.addEventListener('focus',focus);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('focus',focus);window.removeEventListener('storage',storage);};
  },[owner,schools]);
  if(error)return <section className={styles.card} role="alert">{error} <button onClick={()=>setReload(n=>n+1)}>重新读取学校身份</button></section>;
  if(readyOwner!==owner||snapshot.owner!==owner)return <p role="status">正在确认学校身份…</p>;
  if(!snapshot.enabled)return <>{children}</>;
  const optional=path==='/teacher/profile'||path==='/teacher/spaces';
  return <div className={styles.section}>
    <section className={styles.card} aria-label="当前学校"><div className={styles.actions}>
      <label>当前学校 / 机构<select value={snapshot.selected?.membership_id??''} onChange={event=>{
        const item=schools.find(row=>row.membership_id===event.target.value)??null;selectEducation(item);
        try{if(item)localStorage.setItem('education-school-'+owner,item.membership_id);else localStorage.removeItem('education-school-'+owner);}catch{/* 选择仍在当前标签页生效。 */}
      }}><option value="">请选择学校身份</option>{schools.map(item=><option key={item.membership_id} value={item.membership_id}>{item.name} · {item.role==='school_admin'?'学校管理员':'教师'}</option>)}</select></label>
      <Link className={styles.secondary} href="/teacher/spaces">学校与邀请</Link>
    </div><p className={styles.muted}>资源按学校及教师分别保存。切换学校会清空当前页面未提交的编辑；加入学校不代表获得学生学情授权。</p></section>
    {snapshot.selected||optional?<div key={`${owner}-${snapshot.revision}`}>{children}</div>:<section className={styles.card}><h2>{schools.length?'请先选择学校':'尚未加入学校或机构'}</h2><p>你仍可完善任教资料、接受学校邀请。独立执教者请联系平台管理员开通独立教学空间。</p><Link href="/teacher/spaces">查看学校邀请 →</Link></section>}
  </div>;
}
