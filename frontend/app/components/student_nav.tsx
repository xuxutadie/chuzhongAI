"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getWorkspaceLocation, workspaceNavigationGroups } from "./workspace_navigation_model";
import { useStudentSession } from "./student_session_provider";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace_icon";

const navigationAppearance: Record<string, { key: string; icon: WorkspaceIconName; tone: string }> = {
  "/admin": { key: "admin", icon: "home", tone: "blue" },
  "/admin/spaces": { key: "spaces", icon: "users", tone: "amber" },
  "/teacher/spaces": { key: "teacher-spaces", icon: "users", tone: "teal" },
  "/admin/accounts": { key: "accounts", icon: "users", tone: "teal" },
  "/admin/events": { key: "events", icon: "report", tone: "amber" },
  "/dashboard": { key: "dashboard", icon: "home", tone: "blue" },
  "/profile": { key: "progress", icon: "progress", tone: "teal" },
  "/reports": { key: "reports", icon: "report", tone: "teal" },
  "/subjects/math": { key: "math", icon: "math", tone: "blue" },
  "/subjects/english": { key: "english", icon: "language", tone: "teal" },
  "/subjects/chinese": { key: "chinese", icon: "book", tone: "amber" },
  "/today-learning": { key: "today", icon: "tasks", tone: "blue" },
  "/practice": { key: "practice", icon: "target", tone: "blue" },
  "/wrong-questions": { key: "mistakes", icon: "notebook", tone: "amber" },
  "/materials": { key: "resources", icon: "folder", tone: "teal" },
  "/interactive-lessons": { key: "interactive", icon: "cube", tone: "blue" },
  "/assistant": { key: "assistant", icon: "sparkles", tone: "violet" },
  "/model-config": { key: "settings", icon: "settings", tone: "violet" },
  "/ai-settings": { key: "settings", icon: "settings", tone: "violet" },
  "/teacher/students": { key: "students", icon: "users", tone: "blue" },
  "/teacher/profile": { key: "teacher-profile", icon: "settings", tone: "teal" },
  "/teacher/knowledge": { key: "teacher-knowledge", icon: "book", tone: "amber" },
};

const navigationGroupKeys: Record<string, string> = {
  "学习总览": "overview",
  "学科学习": "subjects",
  "学习工具": "tools",
  "AI 教练": "ai",
  "教师管理": "management",
};

export function StudentNav() {
  const pathname = usePathname();
  const [selectedHref, setSelectedHref] = useState(pathname);
  const { user } = useStudentSession();
  const isAdmin = user?.role === "admin";
  const isTeacher = isAdmin || user?.role === "teacher";
  const navigationGroups = isTeacher
    ? [
        {
          label: isAdmin ? "平台管理" : "教师管理",
          items: [
            ...(isAdmin ? [
              { href: "/admin", label: "管理首页", shortLabel: "管理" },
              { href: "/admin/accounts", label: "全部账号", shortLabel: "账号" },
              { href: "/admin/events", label: "操作记录", shortLabel: "记录" },
              { href: "/admin/spaces", label: "学校与机构", shortLabel: "学校" },
            ] : []),
            { href: "/teacher/students", label: "我的学生", shortLabel: "学生" },
            { href: "/teacher/spaces", label: "学校与邀请", shortLabel: "学校" },
            { href: "/teacher/knowledge", label: "知识库", shortLabel: "知识库" },
            { href: "/teacher/profile", label: "任教资料", shortLabel: "资料" },
            ...(isAdmin ? [{ href: "/model-config", label: "服务器 AI 设置", shortLabel: "设置", tone: "mint" as const }] : []),
          ],
        },
      ]
    : workspaceNavigationGroups.map((group) => group.label === "AI 教练"
      ? { ...group, items: group.items.map((item) => item.href === "/model-config" ? { ...item, href: "/ai-settings" } : item) }
      : group,
    );

  useEffect(() => {
    setSelectedHref(pathname);
  }, [pathname]);

  return (
    <nav className="student-sidebar" aria-label="学生学习工作台导航">
      <Link className="workbench-brand" href={isAdmin ? "/admin" : isTeacher ? "/teacher/students" : "/dashboard"}>
        <span className="brand-mark" aria-hidden="true">AI</span>
        <span>
          <strong>学习驾驶舱</strong>
          <small>我的学习空间</small>
        </span>
      </Link>
      {!isTeacher ? <div className="mobile-nav-shortcuts" aria-label="手机端主要入口">
        <Link
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className="mobile-nav-shortcut"
          data-nav-key="dashboard"
          data-nav-tone="blue"
          href="/dashboard"
          onClick={() => setSelectedHref("/dashboard")}
        >
          <WorkspaceIcon className="nav-link-icon" name="home" />
          <span className="nav-link-label">学习首页</span>
        </Link>
        <Link
          aria-current={pathname === "/today-learning" ? "page" : undefined}
          className="mobile-nav-shortcut"
          data-nav-key="today"
          data-nav-tone="blue"
          href="/today-learning"
          onClick={() => setSelectedHref("/today-learning")}
        >
          <WorkspaceIcon className="nav-link-icon" name="tasks" />
          <span className="nav-link-label">今日任务</span>
        </Link>
      </div> : null}
      <div className="sidebar-groups" aria-label="更多学习入口，可左右滑动查看">
        {navigationGroups.map((group) => (
          <section className="sidebar-group" data-nav-group={navigationGroupKeys[group.label]} key={group.label} aria-label={group.label}>
            <p className="sidebar-group-title">{group.label}</p>
            <div className="sidebar-group-links">
              {group.items.map((item) => {
                const isActive = selectedHref === item.href || getWorkspaceLocation(pathname).activeHref === item.href;
                const appearance = navigationAppearance[item.href];
                const className = [
                  "nav-link",
                  item.tone ? `nav-link-${item.tone}` : "",
                  isActive ? "nav-link-is-selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={className}
                    data-nav-key={appearance.key}
                    data-nav-tone={appearance.tone}
                    href={item.href}
                    key={item.href}
                    onClick={() => setSelectedHref(item.href)}
                  >
                    <WorkspaceIcon className="nav-link-icon" name={appearance.icon} />
                    <span className="nav-link-label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="sidebar-footer">完成任务后，这里的学习情况会慢慢更新。</div>
    </nav>
  );
}
