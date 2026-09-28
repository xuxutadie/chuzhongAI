'use client';
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {saveAdmin} from '../api';
import type {Account} from '../types';
export function ReadonlyBanner({account,kind}:{account:Account;kind:'student'|'teacher'}){
  const id=useRef(crypto.randomUUID()),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    saveAdmin('view-events',{target_id:account.id,kind,request_id:id.current},'POST',controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[account.id,kind]);
  return <><section className="admin-panel admin-readonly"><div><strong>管理员只读查看 · {account.display_name}</strong><p>{account.username} · 不提交答案、不推进任务、不修改资料</p></div><Link className="admin-button" href="/admin/accounts">← 返回账号管理</Link></section>{error&&<p role="alert">查看记录保存失败：{error}</p>}</>;
}
