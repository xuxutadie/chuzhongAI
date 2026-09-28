'use client';
import {useState} from 'react';
import {educationRequest,educationSave} from './api';
import {useEducationResource} from './hooks';
import {useAction} from '../teacher/knowledge/api';
import styles from '../teacher/teacher.module.css';
const roles:Record<string,string>={school_admin:'学校管理员',teacher:'教师',student:'学生'};
type Member={id:string;user_id:number;display_name:string;role:string;state:string;revision:number};
type Invitation={school_name:string;issuer_name:string;role:string;expires_at:string;confirmed_token:string};

export function MemberAcceptance(){
  const [token,setToken]=useState(''),[previewResult,setPreview]=useState<Invitation|null>(null),[confirmed,setConfirmed]=useState(false);
  const preview=previewResult?.confirmed_token===token.trim()?previewResult:null;
  const action=useAction();
  return <section className={styles.card}><h2>接受学校邀请</h2><p>邀请绑定你的账号。接受后加入学校，但不会自动允许任何老师查看学习历史。</p>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void action.run(async()=>{
      const confirmed_token=token.trim();setConfirmed(false);setPreview({...await educationRequest<Invitation>('member-invitations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:confirmed_token})}),confirmed_token});
    },'请核对学校及加入身份。');}}><label>学校邀请码<input required minLength={20} maxLength={128} value={token} onChange={event=>{setToken(event.target.value);setPreview(null);setConfirmed(false);}}/></label><button disabled={action.busy}>核对邀请</button></form>
    {preview&&<div><h3>{preview.school_name} · {roles[preview.role]}</h3><p>邀请人：{preview.issuer_name}；有效至 {new Date(preview.expires_at).toLocaleString('zh-CN')}</p><label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> 我确认以以上身份加入该学校或机构</label><button className={styles.primary} disabled={!confirmed||action.busy} onClick={()=>void action.run(async()=>{if(!confirmed)throw Error('请先核对加入身份');await educationSave('member-invitations/accept',{token:preview.confirmed_token});setToken('');setPreview(null);window.location.reload();},'已加入学校。')}>接受学校邀请</button></div>}
    {action.error&&<p role="alert" className={styles.error}>{action.error}</p>}{action.message&&<p role="status">{action.message}</p>}
  </section>;
}

export function MemberManager({spaceId,scoped}:{spaceId:string;scoped:boolean}){
  const [revision,setRevision]=useState(0),[offset,setOffset]=useState(0),[target,setTarget]=useState(''),[role,setRole]=useState('teacher'),[token,setToken]=useState('');
  const {data,error}=useEducationResource<{items:Member[];total:number}>(`spaces/${spaceId}/members?offset=${offset}&limit=20`,scoped,revision);
  const action=useAction(()=>setRevision(n=>n+1));
  return <section className={styles.card}><h2>学校成员名册</h2><p>这里只管理学校身份，不包含成绩、错题或报告。学生学情需要单独授权。</p>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void action.run(async()=>{
      const result=await educationSave<{token:string}>('member-invitations',{space_id:spaceId,target_id:Number(target),role},scoped);setToken(result.token);
    },'邀请已生成，请私下交给目标账号本人确认。');}}><div className={styles.facts}><label>已有账号编号<input type="number" min="1" required value={target} onChange={event=>{setTarget(event.target.value);setToken('');}}/></label><label>邀请加入的身份<select value={role} onChange={event=>{setRole(event.target.value);setToken('');}}>{Object.entries(roles).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div><button className={styles.primary} disabled={action.busy}>生成学校邀请</button></form>
    {token&&<label>24 小时有效 · 请勿公开<textarea readOnly value={token}/></label>}
    {error?<p role="alert">{error}</p>:!data?<p role="status">正在读取成员…</p>:<><ul className={styles.list}>{data.items.map(member=><li key={member.id} className={styles.row}><div><strong>{member.display_name} · 编号 {member.user_id}</strong><p>{roles[member.role]} · {member.state==='active'?'正常':'已停用'}</p></div>{scoped&&<div className={styles.actions}><button disabled={action.busy} onClick={()=>{if(window.confirm('变更学校成员状态？停用后原学情授权与未完成任务将失效，恢复不会复活旧授权。'))void action.run(()=>educationSave(`members/${member.id}/state`,{expected_revision:member.revision,state:member.state==='active'?'disabled':'active'},true));}}>{member.state==='active'?'停用成员':'恢复成员'}</button>{member.role!=='student'&&<button disabled={action.busy} onClick={()=>{if(window.confirm('变更成员角色？已有学情授权将撤销，需要学生重新确认。'))void action.run(()=>educationSave(`members/${member.id}/role`,{expected_revision:member.revision,role:member.role==='teacher'?'school_admin':'teacher'},true));}}>{member.role==='teacher'?'设为学校管理员':'改为教师'}</button>}</div>}</li>)}</ul><div className={styles.actions}><button disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-20))}>上一页</button><span>共 {data.total} 位</span><button disabled={offset+20>=data.total} onClick={()=>setOffset(n=>n+20)}>下一页</button></div></>}
    {action.error&&<p role="alert" className={styles.error}>{action.error}</p>}{action.message&&<p role="status">{action.message}</p>}
  </section>;
}
