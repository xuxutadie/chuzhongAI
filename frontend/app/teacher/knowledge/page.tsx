"use client";
import {useCallback,useState} from 'react';
import {StudentPageShell} from '../../components/student_page_shell';
import {useStudentSession} from '../../components/student_session_provider';
import {teacherRoles} from '../api';
import {TeacherAISettings} from './components/teacher_ai_settings';
import {ImportReview} from './components/import_review';
import {TextbookLibrary} from './components/textbook_library';
import {QuestionLibrary} from './components/question_library';
import {GenerationForm} from './components/generation_form';
import {QuestionSetPreview} from './components/question_set_preview';
import styles from './knowledge.module.css';
function Library({owner}:{owner:number}){
  const [tab,setTab]=useState('questions'),[revision,setRevision]=useState(0);
  const reload=useCallback(()=>setRevision(x=>x+1),[]);
  return <div className={styles.library}><header className={styles.hero}><div><span className={styles.eyebrow}>TEACHER KNOWLEDGE STUDIO</span><h1>好资料，变成好问题。</h1><p>教材定范围 · 题库做参考 · AI 出变式 · 教师把质量关</p></div><div className={styles.actions}><a className={styles.button} href="#knowledge-import">上传资料 ↓</a></div></header>
    <TeacherAISettings/><div id="knowledge-import"><ImportReview owner={owner} onChange={reload}/></div>
    <div className={styles.tabs} role="tablist" aria-label="知识库分类"><button role="tab" id="questions-tab" aria-controls="questions-panel" aria-selected={tab==='questions'} onClick={()=>setTab('questions')}>题库 · 核对与组题</button><button role="tab" id="textbooks-tab" aria-controls="textbooks-panel" aria-selected={tab==='textbooks'} onClick={()=>setTab('textbooks')}>教材 · 章节与范围</button></div>
    {tab==='questions'?<div role="tabpanel" id="questions-panel" aria-labelledby="questions-tab" className={styles.stack}><QuestionLibrary owner={owner} revision={revision} onChange={reload}/><GenerationForm revision={revision} onChange={reload}/><QuestionSetPreview owner={owner} revision={revision} onChange={reload}/></div>:<div role="tabpanel" id="textbooks-panel" aria-labelledby="textbooks-tab"><TextbookLibrary owner={owner} revision={revision} onChange={reload}/></div>}
  </div>;
}
export default function KnowledgePage(){const {user}=useStudentSession();return <StudentPageShell allowedRoles={teacherRoles} eyebrow="教师工作台" title="知识库" description="整理属于你的教学资源" showPageHero={false}>{user&&<Library key={user.id} owner={user.id}/>}</StudentPageShell>;}
