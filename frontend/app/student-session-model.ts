import type { WorkspaceRole } from "./student-api";

export function getRoleHomePath(role: WorkspaceRole) {
  return role === "admin" ? "/admin" : role === "teacher" ? "/teacher/students" : "/dashboard";
}

/** next 只用于当前身份可访问的工作区，防止教师登录后跳回学生门禁。 */
export function getRoleDestination(role: WorkspaceRole, nextPath: string | null) {
  const safe = getSafeNextPath(nextPath);
  if (!safe) return getRoleHomePath(role);
  let pathname: string;
  try { pathname = decodeURIComponent(new URL(safe, 'http://ai-coach.local').pathname); }
  catch { return getRoleHomePath(role); }
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isTeacherPath = pathname === '/teacher' || pathname.startsWith('/teacher/');
  if (role === 'teacher') return isTeacherPath ? safe : getRoleHomePath(role);
  if (role === 'admin') return isAdminPath || isTeacherPath || pathname === '/model-config' ? safe : getRoleHomePath(role);
  return isAdminPath || isTeacherPath || pathname === '/model-config' || pathname === '/login' ? getRoleHomePath(role) : safe;
}

/**
 * 登录后只允许回到当前站点的相对路径，避免查询参数被解释成站外地址。
 */
export function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/")) return null;
  if (/[\\\u0000-\u001F\u007F]/.test(value) || /%2f|%5c/i.test(value)) return null;

  try {
    const applicationOrigin = "http://ai-coach.local";
    const parsed = new URL(value, applicationOrigin);
    return parsed.origin === applicationOrigin ? value : null;
  } catch {
    return null;
  }
}

export function isRoleAllowed(role: WorkspaceRole, allowedRoles: WorkspaceRole[]) {
  return allowedRoles.includes(role);
}

/** 保留当前站内路径，登录成功后可回到用户原本要访问的页面。 */
export function loginRedirectPath(pathname: string) {
  const safePath = getSafeNextPath(pathname) ?? "/dashboard";
  return `/login?next=${encodeURIComponent(safePath)}`;
}
