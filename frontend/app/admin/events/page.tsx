'use client';
import {useState} from 'react';
import {AdminShell,LoadState,Pager} from '../components/admin_shell';
import {useAdminResource} from '../api';
import {actionLabels,type Page} from '../types';
type Event={id:number;actor_id:number|null;target_id:number;kind:string;occurred_at:string;summary:Record<string,string>};
export default function EventsPage(){return <AdminShell title="操作记录"><Events/></AdminShell>;}
function Events(){
  const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  const {data,error}=useAdminResource<Page<Event>>('events?offset='+offset,revision);
  return <><LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>{data&&<section className="admin-panel"><p>记录账号管理与双端查看操作；不记录密码、令牌或 AI 密钥。</p><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th><th>操作</th><th>操作者</th><th>目标账号编号</th></tr></thead><tbody>{data.items.map(event=><tr key={event.id}><td>{new Date(event.occurred_at).toLocaleString('zh-CN')}</td><td>{actionLabels[event.kind]||event.kind}</td><td>{event.actor_id?`#${event.actor_id}`:'本地维护'}</td><td>#{event.target_id}</td></tr>)}</tbody></table></div>{!data.items.length&&<p className="admin-empty">暂无操作记录。</p>}<Pager total={data.total} offset={offset} onChange={setOffset}/></section>}</>;
}
