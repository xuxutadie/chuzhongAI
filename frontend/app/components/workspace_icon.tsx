import type { ReactNode } from "react";

export type WorkspaceIconName =
  | "home" | "progress" | "report" | "math" | "language" | "book"
  | "tasks" | "target" | "notebook" | "folder" | "cube" | "sparkles"
  | "settings" | "users" | "growth" | "logout";

const iconPaths: Record<WorkspaceIconName, ReactNode> = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" /></>,
  progress: <><path d="M4 3v17h17" /><path d="m7 14 4-4 4 2 5-7" /><path d="M16 5h4v4" /></>,
  report: <><path d="M14 3H5v18h14V8Z" /><path d="M14 3v5h5M8 17v-3m4 3v-6m4 6v-3" /></>,
  math: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 12h2m4 0h2m-8 5h2m4-2v4" /></>,
  language: <><path d="M3 5h12M9 3v2M6 5c0 5 4 8 7 10M12 5c0 4-4 8-9 10m11 6 4-10 4 10m-6.5-3h5" /></>,
  book: <><path d="M12 5v16M3 4h5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z" /></>,
  tasks: <><rect x="5" y="4" width="15" height="17" rx="2" /><path d="M9 3h7v4H9ZM8 13l2 2 5-5M8 18h8" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  notebook: <><path d="M5 3h13a2 2 0 0 1 2 2v16H5Z" /><path d="M3 7h4m-4 5h4m-4 5h4M10 8h6m-6 4h6m-6 4h3" /></>,
  folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11H3V7Z" />,
  cube: <><path d="m12 3 9 5v9l-9 5-9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v9m-4.5-16.5 9 5" /></>,
  sparkles: <><path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z" /><path d="M20 2v4m-2-2h4" /></>,
  settings: <><path d="m9 3-.6 2.3-2 .9-2.1-.7L2 9l1.6 1.6v2.8L2 15l2.3 3.5 2.1-.7 2 .9L9 21h6l.6-2.3 2-.9 2.1.7L22 15l-1.6-1.6v-2.8L22 9l-2.3-3.5-2.1.7-2-.9L15 3Z" /><circle cx="12" cy="12" r="3" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" /></>,
  growth: <><path d="M12 21v-8M12 15C5 15 3 11 3 5c6 0 9 3 9 10Zm0-3c0-6 3-9 9-9 0 6-3 9-9 9Z" /></>,
  logout: <><path d="M9 4H4v16h5m5-4 4-4-4-4m-6 4h13" /></>,
};

/** 统一的装饰性线性图标，按钮和链接仍通过旁边的文字提供可访问名称。 */
export function WorkspaceIcon({ name, className }: { name: WorkspaceIconName; className?: string }) {
  return (
    <svg
      className={["workspace-icon", className].filter(Boolean).join(" ")}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconPaths[name]}
    </svg>
  );
}
