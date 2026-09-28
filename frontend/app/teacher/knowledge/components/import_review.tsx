import {useEffect,useState} from 'react';
import {knowledgeRequest,save,useAction,useResource,useCollection} from '../api';
import type {FileData,Item,Job,Page} from '../types';
import {Feedback,FilePreview} from './common';
import styles from '../knowledge.module.css';
const labels:Record<string,string>={queued:'排队中',running:'正在处理',needs_review:'处理完成，待核对',failed:'处理失败',partial_failed:'部分失败',cancelled:'已取消'};
export function ImportReview({owner,onChange}:{owner:number;onChange:()=>void}){
  const [files,setFiles]=useState<File[]>([]),[mode,setMode]=useState('local'),[revision,reload]=useState(0),[selected,setSelected]=useState<Item<FileData>|null>(null),[archived,setArchived]=useState(false);
  const jobs=useResource<Page<Job>>('jobs?limit=20',revision),stored=useCollection<Item<FileData>>(`files?archived=${archived}`,revision);
  const currentFile=stored.data?.items.find(f=>f.id===selected?.id)||selected;
  const action=useAction(()=>{reload(x=>x+1);onChange();});
  useEffect(()=>{const timer=setInterval(()=>reload(x=>x+1),5000);return()=>clearInterval(timer);},[]);
  const [observed,setObserved]=useState('');
  useEffect(()=>{const finished=jobs.data?.items.filter(j=>j.state==='needs_review'||j.state==='partial_failed').map(j=>j.id+j.revision).join()||'';if(finished&&finished!==observed){setObserved(finished);onChange();}},[jobs.data,observed,onChange]);
  return <section className={styles.card}><div><span className={styles.badge}>01 · 资料导入</span><h2>把现有资料变成可用资源</h2></div><p className={styles.hint}>PDF / DOCX 最多 20 MB、50 页；图片最多 5 MB。每批最多 10 个文件、200 道候选题。旧 Word 请先另存为 DOCX。</p>
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(async(signal)=>{
      if(!files.length||files.length>10)throw Error('请选择 1—10 个文件');
      const ids=[];for(const file of files){if(file.size>(/\.(png|jpe?g|webp)$/i.test(file.name)?5:20)*1024*1024)throw Error(`${file.name} 超过大小限制`);
        const item=await knowledgeRequest<Item<FileData>>('files?filename='+encodeURIComponent(file.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file,signal});ids.push(item.id);}
      if(signal.aborted)throw Error('操作已取消');
      await save('imports',{file_ids:ids,mode,request_id:crypto.randomUUID()});setFiles([]);
    },'已提交后台处理，可继续整理其他内容');}}>
      <label>选择资料<input type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
      <div className={styles.row}><label>处理方式<select value={mode} onChange={e=>setMode(e.target.value)}><option value="local">本地提取，自己核对（不调用 AI）</option><option value="questions">使用我的 AI 服务识别并整理题目</option></select></label><button className={styles.primary} disabled={action.busy||!files.length}>{action.busy?'正在上传…':'上传并处理'}</button></div>
      {mode==='questions'&&<p className={styles.notice}>资料相关片段将发送至你配置的 AI / OCR 服务，可能产生服务费用。识别后仍需核对。</p>}<Feedback {...action}/>
    </form>
    <details><summary>处理任务 · 进度与重试</summary><Feedback error={jobs.error}/>{jobs.data?.items.length===0&&<p className={styles.hint}>暂时没有处理任务。</p>}
      <div className={styles.list}>{jobs.data?.items.map(job=><div key={job.id} className={styles.item}><strong>{job.kind==='import'?'资料整理':'出题任务'} · {labels[job.state]||job.state}</strong><span>{job.completed_units} / {job.total_units} 已完成</span>
        {job.errors.map(e=><p className={styles.error} key={e.position}>第 {e.position+1} 项：{e.message}</p>)}<div className={styles.actions}>
          {['queued','running'].includes(job.state)&&<button disabled={action.busy} onClick={()=>void action.run(()=>save(`jobs/${job.id}/cancel`,{expected_revision:job.revision}),'已取消任务')}>取消</button>}
          {['failed','partial_failed'].includes(job.state)&&<button disabled={action.busy} onClick={()=>void action.run(()=>save(`jobs/${job.id}/retry`,{expected_revision:job.revision}),'正在重试失败项')}>重试失败项</button>}
          {job.kind==='generate'&&job.state==='needs_review'&&job.generation&&<button className={styles.mint} disabled={action.busy} onClick={()=>void action.run(()=>save('question-sets',{question_version_ids:job.result_ids,scope:job.generation!.scope,purpose:job.generation!.purpose}),'本次组合已保存到“我的题组”；变式需在题库核对后才能审核题组')}>将本次 {job.result_ids.length} 道题保存为题组</button>}
        </div></div>)}</div></details>
    <details><summary>已上传原件 · 原文对照</summary><Feedback error={stored.error}/><label className={styles.check}><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setSelected(null);}}/>查看已归档文件</label><label>选择文件<select value={selected?.id||''} onChange={e=>setSelected(stored.data?.items.find(f=>f.id===e.target.value)||null)}><option value="">请选择</option>{stored.data?.items.filter(f=>!f.data.asset||f.data.extraction).map(f=><option key={f.id} value={f.id}>{f.data.title}</option>)}</select></label>
      {currentFile&&<><FilePreview key={currentFile.id} file={currentFile} owner={owner}/><div className={styles.actions}>{!archived&&<button disabled={action.busy} onClick={()=>void action.run(()=>save('imports',{file_ids:[currentFile.id],mode,request_id:crypto.randomUUID()}),'已重新提交处理')}>按所选方式处理此文件</button>}<button disabled={action.busy} onClick={()=>void action.run(async()=>{await save(`files/${currentFile.id}/${archived?'restore':'archive'}`,{expected_revision:currentFile.revision});setSelected(null);},archived?'文件已恢复':'文件已归档，相关范围暂不可用于生成')}>{archived?'恢复文件':'归档文件'}</button></div></>}</details>
  </section>;
}
