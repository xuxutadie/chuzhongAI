'use client';
import {StudentPageShell} from '../../components/student_page_shell';
import {teacherRoles} from '../api';
import {useSchoolSelection} from '../../education/school_boundary';
import {MemberAcceptance,MemberManager} from '../../education/membership';
import {useStudentSession} from '../../components/student_session_provider';
export default function Page(){return <StudentPageShell allowedRoles={teacherRoles} eyebrow="教师工作台" title="学校与邀请" description="管理学校身份，与学生学情授权分开确认。"><Content/></StudentPageShell>;}
function Content(){
  const selection=useSchoolSelection(),{user}=useStudentSession();
  if(!selection.enabled)return <p>学校权限尚未整体启用。请等待管理员完成归属核对和迁移验收。</p>;
  return <><p>你的账号编号：<strong>{user?.id}</strong>，学校管理员可以用此编号向你发出邀请。</p><MemberAcceptance/>{selection.selected?.role==='school_admin'&&<MemberManager key={selection.selected.membership_id} spaceId={selection.selected.id} scoped/>}</>;
}
