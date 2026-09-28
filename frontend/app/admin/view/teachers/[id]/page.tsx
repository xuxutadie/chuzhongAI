'use client';
import {useParams} from 'next/navigation';
import {AdminShell} from '../../../components/admin_shell';
import {AdminTeacherInsights} from '../../../components/teacher_insights';
export default function TeacherView(){const {id}=useParams<{id:string}>();return <AdminShell title="教师情况 · 只读查看">{/^[1-9]\d*$/.test(id)?<AdminTeacherInsights key={id} id={Number(id)}/>:<p role="alert">账号编号无效。</p>}</AdminShell>;}
