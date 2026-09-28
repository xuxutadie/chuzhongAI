import {useState} from 'react';
import {knowledgeRequest,save,useAction,useResource,useCollection} from '../api';
import type {Book,Catalog,Chapter,FileData,Item,Page,Source} from '../types';
import {Feedback,FilePreview,Pagination} from './common';
import styles from '../knowledge.module.css';
import {MaterialsWorkspace} from '../../../components/materials_workspace';
import {matchesChapterDraft} from '../state_model';

export function TextbookLibrary({owner,revision,onChange}:{owner:number;revision:number;onChange:()=>void}){
  const [offset,setOffset]=useState(0),[search,setSearch]=useState(''),[archived,setArchived]=useState(false),[selected,setSelected]=useState('');
  const books=useResource<Page<Item<Book>>>(`textbooks?offset=${offset}&search=${encodeURIComponent(search)}&archived=${archived}`,revision);
  const [metadata,setMetadata]=useState({title:'',grade:'7',edition:'北师大版',semester:'上册'});const action=useAction(onChange);
  return <div className={styles.stack}><section className={styles.card}><span className={styles.badge}>教材限定范围，题库提供参考</span><h2>我的数学教材</h2><p className={styles.hint}>上传整章或教学资料，核对知识点后才能用作出题依据。超过 50 页请拆成章节文件，可追加到同一本教材。</p>
    <details><summary>＋ 新建教材</summary><form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(async()=>{const book=await save<Item<Book>>('textbooks',metadata);setSelected(book.id);},'教材已建立，请附加文件并核对章节');}}><label>教材名称<input required maxLength={200} value={metadata.title} onChange={e=>setMetadata({...metadata,title:e.target.value})}/></label>
      <div className={styles.row}><label>年级<select value={metadata.grade} onChange={e=>setMetadata({...metadata,grade:e.target.value})}>{['6','7','8','9'].map(n=><option key={n} value={n}>{n} 年级</option>)}</select></label><label>教材版本<input required maxLength={100} value={metadata.edition} onChange={e=>setMetadata({...metadata,edition:e.target.value})}/></label><label>学期<select value={metadata.semester} onChange={e=>setMetadata({...metadata,semester:e.target.value})}><option>上册</option><option>下册</option></select></label></div><button className={styles.primary} disabled={action.busy}>建立教材</button></form></details><Feedback {...action}/>
    <div className={styles.row}><label>搜索教材<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></label><label className={styles.check}><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setOffset(0);}}/>查看已归档教材</label></div><Feedback error={books.error}/>
    {books.data?.total===0&&<div className={styles.empty}>{search?'没有匹配教材':'还没有教材，先建立一本，再选择已上传的原件。'}</div>}
    <div className={styles.list}>{books.data?.items.map(book=><article key={book.id} className={styles.item}><h3>{book.data.title}</h3><small>{book.data.edition} · {book.data.grade} 年级 · {book.data.semester} · {book.data.file_ids.length} 个文件</small><div className={styles.actions}><button disabled={action.busy} onClick={()=>void action.run(()=>save(`textbooks/${book.id}/${archived?'restore':'archive'}`,{expected_revision:book.revision}),archived?'已恢复':'已归档，历史引用仍保留')}>{archived?'恢复':'归档'}</button>{!archived&&<button className={styles.mint} onClick={()=>setSelected(book.id)}>管理章节 →</button>}</div></article>)}</div>
    {books.data&&<Pagination total={books.data.total} offset={offset} onChange={setOffset}/>}</section>
    {selected&&<ChapterEditor key={selected} owner={owner} bookId={selected} revision={revision} onChange={onChange} onClose={()=>setSelected('')}/>}
    <section className={styles.card}><h3>系统教材</h3><p>已有教材仅供查阅，不会自动进入你的私人题库。当前内置知识点映射为北师大版七年级上册已收录章节；其他版本可保存资料，需核对映射后才能生成。</p><MaterialsWorkspace/></section></div>;
}

function ChapterEditor({owner,bookId,revision,onChange,onClose}:{owner:number;bookId:string;revision:number;onChange:()=>void;onClose:()=>void}){
  const book=useResource<Item<Book>>(`textbooks/${bookId}`,revision),files=useCollection<Item<FileData>>('files',revision),chapters=useCollection<Item<Chapter>>(`chapters?parent_id=${bookId}`,revision),catalog=useResource<Catalog[]>('catalog');
  const [fileId,setFileId]=useState(''),[title,setTitle]=useState(''),[notes,setNotes]=useState(''),[points,setPoints]=useState<string[]>([]),[prerequisites,setPrerequisites]=useState<string[]>([]),[sources,setSources]=useState<Source[]>([]),[editing,setEditing]=useState<Item<Chapter>|null>(null),[draft,setDraft]=useState<Item<Chapter>|null>(null),[confirmed,setConfirmed]=useState(false);
  const action=useAction(onChange);const file=files.data?.items.find(f=>f.id===fileId);
  const matchesDraft=matchesChapterDraft(draft?.data,{title,notes,sources,knowledge_point_ids:points,prerequisite_ids:prerequisites});
  const supported=catalog.data?.filter(c=>c.grade===book.data?.data.grade&&c.edition===book.data?.data.edition&&c.semester===book.data?.data.semester)||[];
  function toggle(id:string,values:string[],setter:(v:string[])=>void){setter(values.includes(id)?values.filter(v=>v!==id):[...values,id]);}
  return <section className={styles.card}><div className={styles.toolbar}><h2>{book.data?.data.title||'教材章节'}</h2><button onClick={onClose}>收起</button></div><Feedback error={book.error||files.error||chapters.error||catalog.error}/>
    <label>附加 / 查看已上传文件<select value={fileId} onChange={e=>setFileId(e.target.value)}><option value="">请选择文件</option>{files.data?.items.filter(f=>!f.data.asset||f.data.extraction).map(f=><option key={f.id} value={f.id}>{f.data.title}</option>)}</select></label>
    {file&&book.data&&!book.data.data.file_ids.includes(file.id)&&<button disabled={action.busy} onClick={()=>void action.run(()=>save(`textbooks/${bookId}/files`,{file_id:file.id,expected_revision:book.data!.revision}),'文件已附加到教材')}>附加到这本教材</button>}
    {file&&<details><summary>对照原文</summary><FilePreview file={file} owner={owner}/></details>}
    <form className={styles.form} onSubmit={e=>{e.preventDefault();void action.run(async()=>{const value=await save<Item<Chapter>>(`textbooks/${bookId}/chapters`,{content:{title,notes,knowledge_point_ids:points,prerequisite_ids:prerequisites,sources,...(editing?{chapter_id:editing.id}:{})},expected_revision:editing?.revision??null});setDraft(value);setEditing(await knowledgeRequest(`chapters/${value.parent_id}`));setConfirmed(false);},'章节草稿已保存，请核对后审核');}}><fieldset disabled={action.busy} className={styles.form}>
      <h3>{editing?'修订章节':'整理章节'}</h3><label>章节名称<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></label>
      {!!file?.data.extraction?.chapter_suggestions?.length&&<label>从原文标题候选开始（仍需核对范围）<select value="" onChange={e=>setTitle(e.target.value)}><option value="">选择候选标题</option>{file.data.extraction.chapter_suggestions.map((s,i)=><option key={i} value={s.title}>{s.title} · 位置 {s.index}</option>)}</select></label>}
      <fieldset><legend>来源页 / 段落（可跨文件选择）</legend>{file?.data.extraction&&book.data?.data.file_ids.includes(file.id)?file.data.extraction.sources.map(s=>{
        const kind=file.data.extraction!.index_kind==='paragraph'?'paragraph':'page';const exists=sources.some(x=>x.file_id===file.id&&x.index===s.index);
        return <label key={s.index} className={styles.check}><input type="checkbox" checked={exists} onChange={()=>setSources(exists?sources.filter(x=>x.file_id!==file.id||x.index!==s.index):[...sources,{file_id:file.id,kind,index:s.index}])}/>{kind==='paragraph'?'段落':'页'} {s.index} · {(s.text||'扫描图，请补充核对笔记').slice(0,65)}</label>;
      }):<p className={styles.hint}>先附加已经提取的文件，再选择章节来源。</p>}<p className={styles.hint}>已选择 {sources.length} 个来源位置</p><button type="button" onClick={()=>setSources([])}>清空来源选择</button></fieldset>
      <fieldset><legend>核对本章知识点</legend>{supported.flatMap(c=>c.knowledge_points).map(p=><label key={p.id} className={styles.check}><input type="checkbox" checked={points.includes(p.id)} onChange={()=>toggle(p.id,points,setPoints)}/>{p.title}</label>)}{!supported.length&&<p className={styles.hint}>此年级或版本暂未有系统知识点映射，可先保存资料草稿。</p>}</fieldset>
      <details><summary>前置知识（按需选择）</summary>{supported.flatMap(c=>c.knowledge_points).filter(p=>!points.includes(p.id)).map(p=><label className={styles.check} key={p.id}><input type="checkbox" checked={prerequisites.includes(p.id)} onChange={()=>toggle(p.id,prerequisites,setPrerequisites)}/>{p.title}</label>)}</details>
      <label>教师核对笔记 / 扫描内容转写<textarea maxLength={15000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="记录本章概念、公式、适用范围；扫描文件请补充关键原文。"/></label><button className={styles.primary} disabled={action.busy}>保存章节草稿</button>
    </fieldset></form>
    {draft&&!matchesDraft&&<p className={styles.hint}>章节内容已修改，请先保存，再核对新版本。</p>}
    {draft&&matchesDraft&&<div className={styles.notice}><strong>{draft.data.title} · {draft.data.status==='reviewed'?'已审核':'待审核'}</strong><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对来源、年级版本、知识点及前置知识</label><button disabled={action.busy||!confirmed||draft.data.status==='reviewed'} onClick={()=>void action.run(async()=>setDraft(await save(`chapter-versions/${draft.id}/review`,{expected_revision:draft.revision})),'章节已审核，可以用于出题')}>确认章节范围</button></div>}
    <Feedback {...action}/><div className={styles.list}>{chapters.data?.items.map(c=><div className={styles.item} key={c.id}><strong>{c.data.title}</strong><small>{c.data.sources.length} 个来源 · {c.data.knowledge_point_ids.length} 个知识点</small><button onClick={()=>void action.run(async()=>{const v=await knowledgeRequest<Item<Chapter>>(`chapter-versions/${c.data.current_version_id}`);setDraft(v);setEditing(c);setTitle(c.data.title);setNotes(c.data.notes);setPoints(c.data.knowledge_point_ids);setPrerequisites(c.data.prerequisite_ids);setSources(c.data.sources);setConfirmed(false);},'已载入章节，可核对或修订')}>核对 / 修订</button></div>)}</div>
  </section>;
}
