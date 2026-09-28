'use client';
import {Suspense,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {AdminShell,LoadState,Pager} from '../components/admin_shell';
import {AccountForm} from '../components/account_form';
import {useAdminResource} from '../api';
import {useStudentSession} from '../../components/student_session_provider';
import {accountActions} from '../state_model';
import {type Account,type Page,roleLabels,stateLabels,actionLabels} from '../types';
export default function AccountsPage(){return <AdminShell title="全部账号"><Suspense fallback={<p>正在读取…</p>}><Accounts/></Suspense></AdminShell>;}
function Accounts(){
  const query=useSearchParams(),{user,refreshSession}=useStudentSession();
  const [search,setSearch]=useState(''),[role,setRole]=useState(query.get('role')||''),[state,setState]=useState('active');
  const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[notice,setNotice]=useState('');
  const [selection,setSelection]=useState<{account:Account|null;action:string}|null>(null);
  const params=new URLSearchParams({search,role,state,offset:String(offset)});
  const {data,error}=useAdminResource<Page<Account>>('accounts?'+params,revision);
  function select(account:Account|null,action:string){setSelection({account,action});setNotice('');window.scrollTo({top:0,behavior:'smooth'});}
  return <><div className="admin-toolbar"><label>搜索账号 / 姓名<input type="search" value={search} placeholder="输入账号或姓名" onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label><label>身份<select value={role} onChange={e=>{setRole(e.target.value);setOffset(0);}}><option value="">全部身份</option>{Object.entries(roleLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>状态<select value={state} onChange={e=>{setState(e.target.value);setOffset(0);}}><option value="active">正常账号</option><option value="disabled">已停用</option><option value="deleted">已删除</option><option value="all">全部状态</option></select></label><button className="admin-primary" onClick={()=>select(null,'create')}>＋ 新增账号</button></div>
    {notice&&<p className="admin-success" role="status">{notice}</p>}
    {selection&&user&&<AccountForm key={`${selection.account?.id||'new'}-${selection.action}`} {...selection} actorId={user.id} onClose={()=>setSelection(null)} onDone={self=>{setSelection(null);setRevision(n=>n+1);setNotice('操作已保存。');if(self)void refreshSession();}}/>}
    <LoadState error={error} loading={!data&&!error} retry={()=>setRevision(n=>n+1)}/>
    {data&&<section className="admin-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>账号</th><th>身份 / 年级</th><th>状态</th><th>查看与管理</th></tr></thead><tbody>{data.items.map(account=><tr key={account.id}><td><strong>{account.display_name}</strong><small>{account.username}{account.id===user?.id?' · 当前账号':''}</small></td><td>{roleLabels[account.role]}<small>{account.grade||'未填写年级'}</small></td><td><span className="admin-badge" data-state={account.state}>{stateLabels[account.state]}</span></td><td><div className="admin-actions"><Link className="admin-button" href={`/admin/view/students/${account.id}`}>{account.role==='student'?'学生情况':'历史学情'}</Link>{['teacher','admin'].includes(account.role)&&<Link className="admin-button" href={`/admin/view/teachers/${account.id}`}>教师情况</Link>}<details><summary>管理操作</summary><div className="admin-actions">{accountActions(account,user?.id||0).map(action=><button key={action} className={action==='delete'?'admin-danger':''} onClick={()=>select(account,action)}>{actionLabels[action]}</button>)}</div></details></div></td></tr>)}</tbody></table></div>{!data.items.length&&<p className="admin-empty">没有匹配的账号，可调整筛选条件。</p>}<Pager total={data.total} offset={offset} onChange={setOffset}/></section>}
    <p>删除仅关闭账号访问，不清除学习数据。教师、学生情况均以只读方式打开。</p></>;
}
