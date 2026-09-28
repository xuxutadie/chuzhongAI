'use client';
import type {ReactNode} from 'react';
import {StudentPageShell} from '../../components/student_page_shell';
import {useStudentSession} from '../../components/student_session_provider';
import '../admin.css';
const roles:('admin')[]=['admin'];
export function AdminShell({title,children}:{title:string;children:ReactNode}){
  const {user}=useStudentSession();
  return <StudentPageShell allowedRoles={roles} eyebrow="平台管理" title={title} description="管理账号，了解学情。查看不改变学习进度。" showPageHero={false}>
    <div className="admin-workspace" key={user?.id}><header className="admin-heading"><span>CONTROL ROOM / 平台管理</span><h1>{title}</h1><p>管理账号，了解学情。查看不改变学习进度。</p></header>{children}</div>
  </StudentPageShell>;
}
export function LoadState({error,loading,retry}:{error:string;loading:boolean;retry:()=>void}){
  return error?<div className="admin-notice" role="alert">{error} <button onClick={retry}>重试</button></div>:loading?<p role="status" className="admin-panel">正在读取…</p>:null;
}
export function Pager({total,offset,onChange}:{total:number;offset:number;onChange:(n:number)=>void}){
  return <div className="admin-pager"><span>共 {total} 项</span><button disabled={offset===0} onClick={()=>onChange(Math.max(0,offset-20))}>上一页</button><span>第 {Math.floor(offset/20)+1} 页</span><button disabled={offset+20>=total} onClick={()=>onChange(offset+20)}>下一页</button></div>;
}
