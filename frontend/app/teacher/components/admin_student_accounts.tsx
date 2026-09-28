"use client";

import { FormEvent, useEffect, useState } from "react";

import { TeacherBatchCreate } from "../../components/teacher_batch_create";
import { useStudentSession } from "../../components/student_session_provider";
import {
  createTeacherStudent,
  listTeacherStudents,
  resetTeacherStudentPassword,
  type CurrentWorkspaceUser,
} from "../../student-api";

export function AdminStudentAccounts() {
  const { user } = useStudentSession();
  const [students, setStudents] = useState<CurrentWorkspaceUser[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [grade, setGrade] = useState("初一");
  const [password, setPassword] = useState("");
  const [resetPassword, setResetPassword] = useState<Record<number, string>>({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshStudents() {
    if (user?.role !== "admin") return;
    setIsLoading(true);
    try {
      setStudents(await listTeacherStudents());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "学生名单暂时无法读取。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshStudents();
  // 仅在教师会话建立或切换时读取一次；提交后会显式刷新。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  async function handleCreateStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    setIsSubmitting(true);
    try {
      const student = await createTeacherStudent({ username, displayName, password, grade });
      setStudents((current) => [...current, student]);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setNotice(`已创建学生账号“${student.display_name}”。请将账号和初始密码单独交给学生。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建学生账号失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(student: CurrentWorkspaceUser) {
    const nextPassword = resetPassword[student.id]?.trim() || "";
    if (nextPassword.length < 8) {
      setError("新密码至少需要 8 个字符。");
      return;
    }
    setNotice("");
    setError("");
    try {
      await resetTeacherStudentPassword(student.id, nextPassword);
      setResetPassword((current) => ({ ...current, [student.id]: "" }));
      setNotice(`已重置“${student.display_name}”的密码，学生需要使用新密码重新登录。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重置密码失败。");
    }
  }

  return (
    <>
      <section className="module teacher-account-panel" aria-labelledby="create-student-title">
        <div className="section-heading">
          <p>学生账号</p>
          <h2 id="create-student-title">添加学生</h2>
        </div>
        <form className="model-config-fields" onSubmit={handleCreateStudent}>
          <label>
            学生称呼
            <input onChange={(event) => setDisplayName(event.target.value)} placeholder="例如：小林" required value={displayName} />
          </label>
          <label>
            登录账号
            <input autoCapitalize="none" autoComplete="username" minLength={3} onChange={(event) => setUsername(event.target.value)} placeholder="3 至 64 个非空白字符" required value={username} />
          </label>
          <label>
            年级（可选）
            <input onChange={(event) => setGrade(event.target.value)} placeholder="例如：初一" value={grade} />
          </label>
          <label>
            初始密码
            <input autoComplete="new-password" minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 个字符" required type="password" value={password} />
          </label>
          <div className="config-action-row">
            <span>系统不会显示或保存明文密码。</span>
            <button disabled={isSubmitting} type="submit">{isSubmitting ? "正在创建…" : "创建学生账号"}</button>
          </div>
        </form>
        {notice ? <p className="form-feedback is-success" role="status">{notice}</p> : null}
        {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
      </section>

      <TeacherBatchCreate key={user?.id ?? "signed-out"} onCreated={(created) => setStudents((current) => [...current, ...created])} />

      <section className="module teacher-students-panel" aria-labelledby="student-list-title">
        <div className="section-heading">
          <p>我的学生</p>
          <h2 id="student-list-title">学生名单</h2>
        </div>
        {isLoading ? <p role="status">正在读取学生名单…</p> : null}
        {!isLoading && !students.length ? <p>还没有创建学生账号。</p> : null}
        <div className="workspace-item-grid">
          {students.map((student) => (
            <article className="workspace-item-card" key={student.id}>
              <div className="workspace-item-content">
                <div className="workspace-item-meta"><small>{student.grade || "年级未填写"}</small><span>学生</span></div>
                <h3>{student.display_name}</h3>
                <p>账号：{student.username}</p>
                <label>
                  重置密码
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setResetPassword((current) => ({ ...current, [student.id]: event.target.value }))}
                    placeholder="输入至少 8 个字符的新密码"
                    type="password"
                    value={resetPassword[student.id] ?? ""}
                  />
                </label>
                <button className="workspace-card-action" onClick={() => void handleResetPassword(student)} type="button">重置密码并退出旧会话</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
