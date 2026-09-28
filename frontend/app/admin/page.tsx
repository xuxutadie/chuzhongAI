'use client';
import Link from 'next/link';
import {useState} from 'react';
import {AdminShell,LoadState} from './components/admin_shell';
import {useAdminResource} from './api';
import type {Account,Page} from './types';
export default function AdminHome(){return <AdminShell title="管理员工作台"><Overview/></AdminShell>;}
function Overview(){
  const [revision,setRevision]=useState(0);
  const all=useAdminResource<Page<Account>>('accounts?state=all&limit=1',revision);
  const students=useAdminResource<Page<Account>>('accounts?role=student&limit=1',revision);
  const teachers=useAdminResource<Page<Account>>('accounts?role=teacher&limit=1',revision);
  return <><section className="admin-panel admin-hero"><div><h2>一个入口，掌握全站情况</h2><p>账号管理在这里完成，双端查看不影响原有学习进度。</p></div><Link className="admin-button admin-primary" href="/admin/accounts">管理全部账号 →</Link></section>
    <LoadState error={all.error||students.error||teachers.error} loading={!all.data&&!all.error} retry={()=>setRevision(n=>n+1)}/>
    <div className="admin-metrics">{[['全部账号',all.data?.total,'/admin/accounts'],['正常学生',students.data?.total,'/admin/accounts?role=student'],['正常教师',teachers.data?.total,'/admin/accounts?role=teacher']].map(([name,total,href])=><section className="admin-panel" key={name}><span>{name}</span><strong>{total??'—'}</strong><Link href={String(href)}>查看账号 →</Link></section>)}</div>
    <section className="admin-panel"><h2>工作入口</h2><div className="admin-links"><Link className="admin-button" href="/teacher/students">进入我的教师端</Link><Link className="admin-button" href="/admin/accounts?role=teacher">查看教师情况</Link><Link className="admin-button" href="/admin/accounts?role=student">查看学生情况</Link><Link className="admin-button" href="/admin/events">操作记录</Link></div><p>选择账号后进入只读视图；如需使用教师功能，请进入自己的教师端。</p></section></>;
}
