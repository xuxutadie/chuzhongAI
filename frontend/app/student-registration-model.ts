import type { WorkspaceRole } from "./student-api";
import { getRoleDestination } from './student-session-model.ts';

export type LoginMode = "login" | "bootstrap" | "register" | "teacher-register";
export type StudentRegistrationInput = { username: string; password: string; displayName: string; grade?: string };

/** 仅清理普通资料，密码必须按学生原样输入校验，不能自动裁剪。 */
export function buildStudentRegistration(input: StudentRegistrationInput & { confirmPassword: string }): StudentRegistrationInput {
  const username = input.username.trim();
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 40) throw new Error("请填写 1 至 40 个字符的称呼。");
  if (username.length < 3 || username.length > 64 || /\s/.test(username)) throw new Error("账号需要 3 至 64 个非空白字符。");
  if (input.password.length < 8) throw new Error("密码至少 8 个字符。");
  if (input.password.length > 256) throw new Error("密码不能超过 256 个字符。");
  if (input.password !== input.confirmPassword) throw new Error("两次密码不一致，请重新确认。");
  return { username, displayName, password: input.password, ...(input.grade ? { grade: input.grade } : {}) };
}

/** 新注册学生先建档；普通登录由首次诊断门禁判断是否需要继续访谈。 */
export function getRegistrationDestination(mode: LoginMode, nextPath: string | null, role: WorkspaceRole) {
  if (mode === "register") return "/onboarding";
  return getRoleDestination(role, nextPath);
}
