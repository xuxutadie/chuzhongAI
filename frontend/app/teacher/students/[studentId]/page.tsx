"use client";
import { useParams } from "next/navigation";
import { StudentPageShell } from "../../../components/student_page_shell";
import { teacherRoles } from "../../api";
import { StudentInsights } from "../../components/student_insights";
export default function StudentDetailPage() {
  const params=useParams<{studentId:string}>();
  const id=Number(params.studentId);
  return <StudentPageShell allowedRoles={teacherRoles} eyebrow="教师工作台" title="学生学情" description="只读查看学生授权的真实学习记录，不改变学习进度。">
    {Number.isSafeInteger(id)&&id>0?<StudentInsights key={id} studentId={id}/>:<p role="alert">学生编号无效。</p>}
  </StudentPageShell>;
}
