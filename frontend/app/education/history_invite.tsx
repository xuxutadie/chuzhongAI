'use client';
import {useState} from 'react';
import {educationSave} from './api';
import {useAction} from '../teacher/knowledge/api';
import styles from '../teacher/teacher.module.css';
export function HistoryInvite(){
  const [student,setStudent]=useState(''),[receipt,setReceipt]=useState<{token:string;expires_at:string}|null>(null);
  const action=useAction();
  return <section className={`${styles.card} ${styles.claim}`}><h2>邀请学生授权</h2>
    <p>让学生在“授权管理”查看自己的账号编号。你发出邀请后，必须由该学生登录并明确同意，才能查看学情。</p>
    <form className={styles.form} onSubmit={event=>{event.preventDefault();void action.run(async()=>{
      const id=Number(student);if(!Number.isSafeInteger(id)||id<=0)throw Error('请填写有效学生账号编号');
      setReceipt(await educationSave('history-invitations',{student_id:id},true));
    },'邀请已生成；学生确认前不会获得查看权限。');}}>
      <label>学生账号编号<input type="number" min="1" required value={student} onChange={event=>{setStudent(event.target.value);setReceipt(null);}}/></label>
      <button className={styles.primary} disabled={action.busy}>生成授权邀请</button>
    </form>
    {receipt&&<div><p>请私下发送给学生，由其在“授权管理”粘贴并核对。有效至 {new Date(receipt.expires_at).toLocaleString('zh-CN')}。</p><textarea aria-label="授权邀请码" readOnly value={receipt.token}/></div>}
    {action.error&&<p role="alert" className={styles.error}>{action.error}</p>}{action.message&&<p role="status">{action.message}</p>}
  </section>;
}
