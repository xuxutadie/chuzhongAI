"use client";

import { StudentPageShell } from "../components/student_page_shell";
import { useStudentSession } from "../components/student_session_provider";
import Link from "next/link";
import { DiagnosisProfileCard } from "../diagnosis/profile_card";
import { StudentTeacherLinks } from "../components/student_teacher_links";

export default function ProfilePage() {
  const { user } = useStudentSession();

  return (
    <StudentPageShell
      eyebrow="我的学习情况"
      title="我的学习档案"
      description="查看个人资料，回顾入学访谈。每天的学习进度请在学习首页查看。"
    >
      <DiagnosisProfileCard />
      <StudentTeacherLinks />
      <section className="module" id="profile" aria-labelledby="profile-title">
        <div className="section-heading">
          <p>账号信息</p>
          <h2 id="profile-title">我的学习档案</h2>
        </div>
        <div className="profile-grid">
          <article className="profile-card">
            <div className="profile-score"><span>姓名</span><strong>{user?.display_name || "—"}</strong></div>
            <p>账号：{user?.username || "—"}</p>
            <dl>
              <div><dt>年级</dt><dd>{user?.grade || "尚未填写"}</dd></div>
              <div><dt>今日进度</dt><dd><Link href="/dashboard">查看五步学习进度 →</Link></dd></div>
              <div><dt>学习画像</dt><dd>完成更多经过核验的任务后，系统才会生成学习建议。</dd></div>
            </dl>
          </article>
        </div>
      </section>
    </StudentPageShell>
  );
}
