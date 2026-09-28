import { requestJson, normalizeWorkspaceUser, type CurrentWorkspaceUser, type WorkspaceRole } from "../student-api.ts";
import { buildStudentRegistration } from "../student-registration-model.ts";
import {captureEducation,educationBinaryUrl} from '../education/context_model.ts';
import {educationRequest} from '../education/api.ts';

export const teacherRoles: WorkspaceRole[] = ["teacher", "admin"];
export type TeacherProfile = { user_id: number; display_name: string; school_name: string; teaching_classes: string[] };
export type TeacherRegistration = { username: string; password: string; display_name: string; school_name: string; teaching_classes: string[] };
export type LinkReceipt = { link_id: number; student_id: number; linked_at: string };
export function buildTeacherRegistration(input: { username: string; password: string; confirmPassword: string; displayName: string; school: string; classes: string }): TeacherRegistration {
  const account = buildStudentRegistration(input);
  const school = input.school.trim();
  const classes = [...new Set(input.classes.split(/[,，、\n]/).map(value => value.trim()).filter(Boolean))];
  if (!school || school.length > 100) throw new Error("请填写学校全称，不超过 100 字。");
  if (!classes.length || classes.length > 20 || classes.some(value => value.length > 40)) throw new Error("请填写 1 至 20 个任教班级，每项不超过 40 字。");
  return { username: account.username, password: account.password, display_name: account.displayName, school_name: school, teaching_classes: classes };
}
export async function registerTeacher(input: TeacherRegistration) {
  const result = await requestJson<{ user: CurrentWorkspaceUser }>("/api/auth/register-teacher", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  return normalizeWorkspaceUser(result.user);
}
export function teacherGet<T>(path: string, signal?: AbortSignal) {
  if(captureEducation().enabled&&path.startsWith('linked-students'))return educationRequest<T>(path.replace(/^linked-students/,'students'),{signal},true);
  return requestJson<T>(`/api/teacher/workspace/${path}`, { signal });
}
export function teacherBinaryUrl(path:string,owner:number){
  return captureEducation().enabled?educationBinaryUrl('/api/education/'+path.replace(/^linked-students/,'students'),owner):`/api/teacher/workspace/${path}?expected_user_id=${owner}`;
}
export function teacherPost<T>(path: string, body: unknown, method = "POST", signal?: AbortSignal) {
  return requestJson<T>(`/api/teacher/workspace/${path}`, { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
export function teacherDelete(path: string) {
  return requestJson<void>(`/api/teacher/workspace/${path}`, { method: "DELETE" });
}
