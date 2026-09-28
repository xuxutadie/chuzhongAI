'use client';
import {useState} from 'react';
import {educationRequest,educationSave} from './api';
import {useEducationResource} from './hooks';
import {useAction} from '../teacher/knowledge/api';
import {useStudentSession} from '../components/student_session_provider';
import styles from '../teacher/teacher.module.css';
type Preview={teacher_name:string;space_name:string;notice:string;expires_at:string;confirmed_token:string};
type Grant=Preview&{id:string;revision:number;state:string;updated_at:string};
export function Authorizations(){
  const {user}=useStudentSession();
  const [token,setToken]=useState(''),[previewResult,setPreview]=useState<Preview|null>(null),[consent,setConsent]=useState(false),[revision,setRevision]=useState(0);
  // 迟到预览不能改变当前确认对象，提交也只使用实际展示过的邀请。
  const preview=previewResult?.confirmed_token===token.trim()?previewResult:null;
  const {data:result,error}=useEducationResource<{items:Grant[]}>('grants',false,revision);
  const data=result?.items;
  const action=useAction(()=>setRevision(n=>n+1));
  return <div className={styles.section}><section className={styles.card}><h2>我的学情，由我授权</h2>
    <p>你的账号编号：<strong>{user?.id}</strong>。只交给你认识的老师，不要公开发布。</p>
    <p>加入学校与授权老师查看学情是两件事。老师只能读取你同意的范围，不能修改答案、成绩或删除记录。</p>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void action.run(async()=>{
      const confirmed_token=token.trim();setConsent(false);setPreview({...await educationRequest<Preview>('history-invitations/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:confirmed_token})}),confirmed_token});
    },'请核对教师、学校和授权范围。');}}>
      <label>教师发来的授权邀请码<input required minLength={20} maxLength={128} autoComplete="off" value={token} onChange={event=>{setToken(event.target.value);setPreview(null);setConsent(false);}}/></label>
      <button className={styles.secondary} disabled={action.busy}>先核对邀请</button>
    </form>
    {preview&&<section className={styles.card}><h3>{preview.teacher_name} · {preview.space_name}</h3><p>{preview.notice}</p>
      <label><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/> 我已核对身份，同意该教师只读查看我的全部历史及授权有效期间新增的学习记录</label>
      <p>不包含未交卷答案、私人密钥或教师原始题库。你可随时撤销；已经下载的文件无法远程收回。</p>
      <button className={styles.primary} disabled={!consent||action.busy} onClick={()=>void action.run(async()=>{if(!consent)throw Error('请先确认授权范围');await educationSave('grants',{token:preview.confirmed_token,consent:true});setPreview(null);setToken('');setConsent(false);},'授权已生效。')}>确认授权</button>
    </section>}
    {action.error&&<p role="alert" className={styles.error}>{action.error}</p>}{action.message&&<p role="status">{action.message}</p>}
  </section><section className={styles.card}><h2>已授权的教师</h2><button className={styles.secondary} onClick={()=>setRevision(n=>n+1)}>刷新授权</button>
    {error?<p role="alert">{error}</p>:!data?<p role="status">正在读取…</p>:!data.length?<p>还没有教师获得你的学情授权。</p>:<ul className={styles.list}>{data.map(grant=><li key={grant.id} className={styles.row}><div><strong>{grant.teacher_name} · {grant.space_name}</strong><p>{grant.state==='active'?'授权有效 · 全部历史，只读':'已撤销'}</p></div>{grant.state==='active'&&<button className={styles.danger} disabled={action.busy} onClick={()=>{if(window.confirm('撤销该教师的查看权限？你的学习记录会完整保留。'))void action.run(()=>educationSave(`grants/${grant.id}/revoke`,{expected_revision:grant.revision}),'已撤销，不影响其他教师的授权。');}}>撤销授权</button>}</li>)}</ul>}
  </section></div>;
}
