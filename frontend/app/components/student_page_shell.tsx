"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { DashboardParticleField } from "./dashboard_particle_field";
import { useLearningProgress } from "./learning_progress_provider";
import { StudentNav } from "./student_nav";
import { WorkspaceIcon } from "./workspace_icon";
import { SESSION_EXPIRED_MESSAGE, useStudentSession } from "./student_session_provider";
import { getRoleHomePath, isRoleAllowed, loginRedirectPath } from "../student-session-model";
import type { WorkspaceRole } from "../student-api";
import { isHiddenSubjectPath } from "../subject-visibility.js";
import { getWorkspaceLocation } from "./workspace_navigation_model";
import {SchoolBoundary} from '../education/school_boundary';

const studentOnlyRoles: WorkspaceRole[] = ["student"];

type StudentPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  showParticleField?: boolean;
  showPageHero?: boolean;
  allowedRoles?: WorkspaceRole[];
};

export function StudentPageShell({
  eyebrow,
  title,
  description,
  children,
  showParticleField = false,
  showPageHero = true,
  allowedRoles = studentOnlyRoles,
}: StudentPageShellProps) {
  const { progress, storageWarning } = useLearningProgress();
  const { logout, status, user, error, refreshSession } = useStudentSession();
  const pathname = usePathname();
  const location = getWorkspaceLocation(pathname);
  const router = useRouter();
  const isAuthorized = status === "authenticated" && user && isRoleAllowed(user.role, allowedRoles);

  useEffect(() => {
    if (status === "loading") return;
    if (!user) {
      if (!error || error === SESSION_EXPIRED_MESSAGE) router.replace(loginRedirectPath(pathname));
      return;
    }
    if (!isRoleAllowed(user.role, allowedRoles)) {
      router.replace(getRoleHomePath(user.role));
    }
  }, [allowedRoles, error, pathname, router, status, user]);

  async function handleLogout() {
    if (await logout()) router.replace("/login");
  }

  if (status === "loading") {
    return (
      <main className="student-workbench student-workbench-loading">
        <p role="status">正在确认你的学习账号…</p>
      </main>
    );
  }

  if (!user && error) {
    return (
      <main className="student-workbench student-workbench-loading">
        <section className="session-error-panel" aria-labelledby="session-error-title">
          <p>学习账号</p>
          <h1 id="session-error-title">账号服务暂时无法连接</h1>
          <span>{error}</span>
          <button onClick={() => void refreshSession()} type="button">重新尝试</button>
        </section>
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="student-workbench student-workbench-loading">
        <p role="status">正在前往正确的学习入口…</p>
      </main>
    );
  }

  return (
    <main className={`student-workbench${user.role === "student" ? " student-workspace-refined" : ""}`} data-workspace-area={location.activeHref ?? "account"}>
      {showParticleField ? <DashboardParticleField /> : null}
      <StudentNav />
      <section className="workbench-main">
        <header className="workbench-header">
          <div className="header-context">
            <span>我的学习空间</span>
            {user.role === "student" && location.parentHref ? <nav className="workspace-breadcrumb" aria-label="当前位置"><Link href={location.parentHref}>{location.parentLabel}</Link><span aria-hidden="true">/</span><strong>{location.label}</strong></nav> : <strong>{user.role === "admin" ? "管理员工作台" : user.role === "teacher" ? "教师工作台" : location.label}</strong>}
          </div>
          <div className="header-status">
            {user.role === "student" ? <details className="header-account-menu"><summary>{user.display_name} · 我的账号</summary><div><Link href="/profile">学习档案</Link><Link href="/authorizations">授权管理</Link><Link href="/ai-settings">AI 设置</Link></div></details> : <span className="header-user-info">{user.display_name} · {user.role === 'admin' ? '管理员' : '教师'}</span>}
            {user.role === "student" ? <span className="growth-status"><WorkspaceIcon name="growth" />今日已获得 {progress.growthEarned} 成长值</span> : null}
            {user.role === "student" ? <Link className="header-ai-action" href="/assistant"><WorkspaceIcon name="sparkles" />AI 教练</Link> : null}
            <button className="header-logout-action" onClick={handleLogout} type="button"><WorkspaceIcon name="logout" />退出登录</button>
          </div>
        </header>
        <div className="workbench-content" key={`workspace-user-${user.id}`}>
          {error ? <p className="daily-progress-storage-warning" role="alert">{error}</p> : null}
          {storageWarning ? (
            <p className="daily-progress-storage-warning" role="alert">
              当前浏览器暂时无法保存今日学习进度。你可以继续完成本页操作，但请暂时不要关闭页面。
            </p>
          ) : null}
          {showPageHero ? (
            <section className="workbench-page-intro" aria-labelledby="page-title">
              <p>{eyebrow}</p>
              <h1 id="page-title">{title}</h1>
              <span>{description}</span>
            </section>
          ) : null}
          {isHiddenSubjectPath(pathname) ? <section className="workbench-inline-note"><span>当前先专注数学学习。语文、英语暂时隐藏，原有学习记录仍保留，后续再开放。</span><Link href="/subjects/math">进入数学学习</Link></section> : pathname.startsWith('/teacher/') ? <SchoolBoundary key={user.id} owner={user.id} path={pathname}>{children}</SchoolBoundary> : children}
        </div>
      </section>
    </main>
  );
}
