'use client';
import {useEffect,useRef,useState} from 'react';
import {saveAdmin} from '../api';
import {actionLabels,type Account} from '../types';
export function AccountForm({account,action,actorId,onDone,onClose}:{account:Account|null;action:string;actorId:number;onDone:(selfChanged:boolean)=>void;onClose:()=>void}){
  const [username,setUsername]=useState(account?.username||''),[name,setName]=useState(account?.display_name||'');
  const [role,setRole]=useState<Account['role']>(account?.role||'student'),[grade,setGrade]=useState(account?.grade||'');
  const [password,setPassword]=useState(''),[adminPassword,setAdminPassword]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),pending=useRef(false),requestId=useRef(crypto.randomUUID());
  useEffect(()=>()=>controller.current?.abort(),[]);
  const editing=action==='edit'||action==='create';
  async function submit(event:React.FormEvent){
    event.preventDefault();if(pending.current)return;
    pending.current=true;setBusy(true);setError('');controller.current=new AbortController();
    const base={request_id:requestId.current,admin_password:adminPassword};
    let path='accounts',method='POST',body:Record<string,unknown>=base;
    if(action==='create')body={...base,username,display_name:name,role,grade:grade||null,password};
    else if(account){
      const update={...base,expected_revision:account.revision};
      if(action==='edit'){path+=`/${account.id}`;method='PUT';body={...update,username,display_name:name,role,grade:grade||null};}
      else if(action==='reset-password'){path+=`/${account.id}/reset-password`;body={...update,password};}
      else {path+=`/${account.id}/state`;body={...update,action};}
    }
    try{await saveAdmin(path,body,method,controller.current.signal);setPassword('');setAdminPassword('');onDone(account?.id===actorId);}
    catch(e){if(!controller.current?.signal.aborted)setError(e instanceof Error?e.message:'保存失败，请重试');}
    finally{pending.current=false;if(!controller.current?.signal.aborted)setBusy(false);}
  }
  return <section className="admin-panel admin-form" aria-label={actionLabels[action]}><h2>{actionLabels[action]}{account?` · ${account.display_name}`:''}</h2>
    <form onSubmit={submit} onChange={()=>{requestId.current=crypto.randomUUID();}}><fieldset disabled={busy}><div className="admin-fields">
      {editing&&<><label>登录账号<input autoFocus required minLength={3} maxLength={64} value={username} onChange={e=>setUsername(e.target.value)}/></label><label>姓名<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label><label>身份<select value={role} disabled={account?.id===actorId} onChange={e=>setRole(e.target.value as Account['role'])}><option value="student">学生</option><option value="teacher">教师</option><option value="admin">管理员</option>{account?.role==='parent'&&<option value="parent">家长</option>}{account?.role==='coach'&&<option value="coach">教练</option>}</select></label><label>年级（可选）<input maxLength={24} value={grade} onChange={e=>setGrade(e.target.value)} placeholder="例如：七年级"/></label></>}
      {(action==='create'||action==='reset-password')&&<label>{action==='create'?'初始密码':'新密码'}<input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      <label>你的管理员密码<input type="password" autoComplete="current-password" required maxLength={256} value={adminPassword} onChange={e=>setAdminPassword(e.target.value)}/></label>
    </div>
    {action==='delete'&&<p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 确认删除此账号：立即退出登录，保留记录，可恢复。</label></p>}
    {action==='restore'&&<p>恢复后仍为停用状态。核对账号后，再点击“启用”。</p>}
    {action==='edit'&&<p>保存后该账号需要重新登录；角色调整不删除历史数据，也不转移师生关系。</p>}
    {error&&<p role="alert" className="admin-notice">{error}</p>}<div className="admin-actions"><button className={action==='delete'?'admin-danger':'admin-primary'} disabled={busy||(action==='delete'&&!confirmed)}>{busy?'正在保存…':'确认'+actionLabels[action]}</button><button type="button" onClick={onClose}>取消</button></div>
    </fieldset></form></section>;
}
