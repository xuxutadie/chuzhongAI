'use client';
import {useParams} from 'next/navigation';
import {AdminShell} from '../../../components/admin_shell';
import {AdminStudentInsights} from '../../../components/student_insights';
export default function StudentView(){const {id}=useParams<{id:string}>();return <AdminShell title="学生情况 · 只读查看">{/^[1-9]\d*$/.test(id)?<AdminStudentInsights key={id} id={Number(id)}/>:<p role="alert">账号编号无效。</p>}</AdminShell>;}
