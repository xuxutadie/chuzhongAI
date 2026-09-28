import {useState} from 'react';
import {save,useAction,useResource} from '../api';
import {Feedback} from './common';
import styles from '../knowledge.module.css';
type Status={mode:string;allocated_capabilities?:string[];llm:{configured:boolean;enabled:boolean};ocr:{configured:boolean;enabled:boolean};providers:{provider:string;api_base_url:string}[]};
export function TeacherAISettings(){
  const [revision,reload]=useState(0),[capability,setCapability]=useState('llm'),[provider,setProvider]=useState(''),[model,setModel]=useState(''),[key,setKey]=useState('');
  const {data,error}=useResource<Status>('ai',revision),action=useAction(()=>reload(x=>x+1));
  return <section className={styles.card}><div className={styles.toolbar}><h3>教师 AI 服务</h3>{data&&<span className={styles.badge}>{data.llm.configured&&data.llm.enabled?'AI 已配置':'AI 未就绪 · 可手动整理'}</span>}</div><Feedback error={error}/>
    {!!data?.allocated_capabilities?.length&&<p className={styles.notice}>本学校已明确分配平台服务：{data.allocated_capabilities.map(name=>name==='llm'?'题目整理与变式':'OCR 识别').join('、')}。这些能力优先使用平台服务，未分配的能力使用当前学校下你的私有配置。</p>}
    {data?.mode==='server'?<p className={styles.hint}>当前是管理员账号，使用已有服务器 AI 配置。<a href="/model-config">前往服务器设置</a></p>:<details><summary>配置 / 更新我的 AI 与 OCR</summary><p className={styles.hint}>学校隔离启用后，私有配置仅用于当前学校下的本教师账号；不读取学生密钥。平台服务仅在管理员明确分配后使用。</p>
      <form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(async()=>{const chosen=data?.providers.find(p=>p.provider===provider);if(!chosen)throw Error('请选择服务商');await save(`ai/${capability}`,{enabled:true,provider,model,api_base_url:chosen.api_base_url,api_key:key},'PUT');setKey('');},'配置已加密保存');}}><div className={styles.row}><label>用途<select value={capability} onChange={e=>{setCapability(e.target.value);setKey('');}}><option value="llm">题目整理 / 变式</option><option value="ocr">图片 / 扫描识别</option></select></label><label>官方服务商<select required value={provider} onChange={e=>setProvider(e.target.value)}><option value="">请选择</option>{data?.providers.map(p=><option key={p.provider}>{p.provider}</option>)}</select></label></div>
      <label>模型名称<input required value={model} onChange={e=>setModel(e.target.value)} placeholder="填写服务商提供的模型名称，OCR 需支持图片"/></label><label>API Key<input type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value)} placeholder="首次必填；同服务商留空保留原密钥"/></label><div className={styles.actions}><button disabled={action.busy} type="button" onClick={()=>void action.run(()=>save(`ai/${capability}`,{},'DELETE'),'已清除此用途的配置')}>清除此配置</button><button className={styles.primary} disabled={action.busy}>加密保存</button></div><Feedback {...action}/></form></details>}
  </section>;
}
