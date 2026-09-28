'use client';
import {StudentPageShell} from '../components/student_page_shell';
import {Authorizations} from '../education/authorizations';
import {useEducationResource} from '../education/hooks';
import {MemberAcceptance} from '../education/membership';
export default function Page(){
  return <StudentPageShell eyebrow="账号与隐私" title="授权管理" description="明确选择哪些老师可以查看你的学习记录。"><Content/></StudentPageShell>;
}
function Content(){
  const {data,error}=useEducationResource<{enabled:boolean}>('status');
  if(error)return <p role="alert">{error}</p>;
  if(!data)return <p role="status">正在确认授权服务…</p>;
  return data.enabled?<><Authorizations/><MemberAcceptance/></>:<p>学校授权功能尚未启用，现有学习记录不受影响。正式切换后可在这里核对教师邀请并管理授权。</p>;
}
