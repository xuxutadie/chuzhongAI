'use client';
import {useState} from 'react';
import {AdminShell} from '../components/admin_shell';
import {useEducationResource} from '../../education/hooks';
import {educationSave} from '../../education/api';
import {MemberManager} from '../../education/membership';
import {useAction} from '../../teacher/knowledge/api';
import styles from '../../teacher/teacher.module.css';
type Space={id:string;name:string;kind:string;state:string;revision:number};
export default function Page(){return <AdminShell title="学校与机构"><Gate/></AdminShell>;}
function Gate(){
  const {data,error}=useEducationResource<{enabled:boolean}>('status');
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p role="status">正在确认迁移状态…</p>;
  return data.enabled?<Spaces/>:<section className={styles.card}><h2>尚未启用学校隔离</h2><p>请先完成现有教师、资料归属核对及副本演练。这里不会自动迁移真实账号，也不会根据自填学校名称分配权限。</p></section>;
}
function Spaces(){
  const [revision,setRevision]=useState(0),[name,setName]=useState(''),[kind,setKind]=useState('school'),[selected,setSelected]=useState<string|null>(null);
  const {data,error}=useEducationResource<{items:Space[]}>('spaces',false,revision),action=useAction(()=>setRevision(n=>n+1));
  return <div className={styles.section}><section className={styles.card}><h2>开通教学空间</h2><form className={styles.form} onSubmit={event=>{event.preventDefault();void action.run(async()=>{await educationSave('spaces',{name,kind});setName('');},'空间已开通，请邀请首位学校管理员。');}}><div className={styles.facts}><label>学校 / 机构名称<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label><label>空间类型<select value={kind} onChange={event=>setKind(event.target.value)}><option value="school">学校</option><option value="institution">培训机构</option><option value="independent">独立教学空间</option></select></label></div><button className={styles.primary} disabled={action.busy}>开通空间</button></form>
    {action.error&&<p role="alert">{action.error}</p>}{action.message&&<p role="status">{action.message}</p>}
  </section><section className={styles.card}><h2>已开通空间</h2>{error?<p role="alert">{error}</p>:!data?<p role="status">正在读取…</p>:!data.items.length?<p>暂无学校或机构。</p>:<ul className={styles.list}>{data.items.map(space=><li className={styles.row} key={space.id}><div><strong>{space.name}</strong><p>{space.state==='active'?'正常':'已停用'} · 独立数据边界</p></div><div className={styles.actions}><button onClick={()=>setSelected(space.id)}>成员与 AI 服务</button><button className={styles.danger} disabled={action.busy} onClick={()=>{if(window.confirm('确定变更空间状态？停用会撤销学情授权并终止未完成任务；恢复不会恢复旧授权。'))void action.run(()=>educationSave(`spaces/${space.id}/state`,{expected_revision:space.revision,state:space.state==='active'?'disabled':'active'}));}}>{space.state==='active'?'停用':'恢复'}</button></div></li>)}</ul>}</section>
    {selected&&<div key={selected}><h2>{data?.items.find(item=>item.id===selected)?.name}</h2><MemberManager spaceId={selected} scoped={false}/><Allocations spaceId={selected}/></div>}
  </div>;
}
function Allocations({spaceId}:{spaceId:string}){
  const [revision,setRevision]=useState(0),{data,error}=useEducationResource<{items:{capability:string;enabled:boolean;revision:number}[]}>(`spaces/${spaceId}/ai`,false,revision);
  const action=useAction(()=>setRevision(n=>n+1));
  return <section className={styles.card}><h2>分配平台 AI 服务</h2><p>仅开启所选学校的能力。开启后，该校教师可调用平台统一服务并产生供应商费用；不会向教师显示平台密钥。</p>{error&&<p role="alert">{error}</p>}{data&&(['llm','ocr'] as const).map(capability=>{const item=data.items.find(row=>row.capability===capability);return <div className={styles.row} key={capability}><strong>{capability==='llm'?'题目整理与变式':'图片与扫描识别'} · {item?.enabled?'已分配':'未分配'}</strong><button disabled={action.busy} onClick={()=>{if(window.confirm('确认修改本学校的平台 AI 服务分配？'))void action.run(()=>educationSave(`spaces/${spaceId}/ai/${capability}`,{enabled:!item?.enabled,expected_revision:item?.revision??0},false,'PUT'));}}>{item?.enabled?'停止分配':'明确分配'}</button></div>;})}{action.error&&<p role="alert">{action.error}</p>}</section>;
}
