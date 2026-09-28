"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getSessionEpoch } from "../session_epoch.js";
import { createTeacherStudentsBatch, type CurrentWorkspaceUser } from "../student-api";
import { parseStudentBatch } from "../teacher-batch-model";

export function TeacherBatchCreate({ onCreated }: { onCreated: (students: CurrentWorkspaceUser[]) => void }) {
  const [roster, setRoster] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const epoch = getSessionEpoch();
    const current = () => mounted.current && epoch === getSessionEpoch();
    setError("");
    setNotice("");
    try {
      const students = parseStudentBatch(roster);
      inFlight.current = true;
      setIsSubmitting(true);
      const created = await createTeacherStudentsBatch(students);
      if (!current()) return;
      setRoster("");
      onCreated(created);
      setNotice(`已创建 ${created.length} 名学生，均使用教师统一提供的 AI 服务，无需设置个人 API。`);
    } catch (requestError) {
      if (current()) setError(requestError instanceof Error ? requestError.message : "批量创建失败，请稍后重试。");
    } finally {
      inFlight.current = false;
      if (current()) setIsSubmitting(false);
    }
  }

  return (
    <section className="module teacher-account-panel" aria-labelledby="batch-student-title">
      <div className="section-heading">
        <p>班级开通</p>
        <h2 id="batch-student-title">批量创建学生</h2>
      </div>
      <p>每行填写：账号、学生称呼、独立初始密码、年级（可选）。使用逗号或从表格复制，每批最多 50 人。</p>
      <p>请为每人设置不同密码，提前通过安全渠道单独发放；名单提交后会清空。字段内不要包含逗号或制表符。</p>
      <form className="teacher-batch-form" onSubmit={handleSubmit}>
        <label htmlFor="student-batch-roster">学生名单（含初始密码，请勿截图或公开分享）</label>
        <textarea
          id="student-batch-roster" autoComplete="off" spellCheck={false} rows={7}
          maxLength={22000} required disabled={isSubmitting} value={roster}
          onChange={(event) => setRoster(event.target.value)}
          placeholder={"student01,小林,请填写独立初始密码,初一\nstudent02,小王,请填写另一个密码,初一"}
        />
        <div className="config-action-row">
          <span>全批校验通过才会创建；若存在重复账号，本批不会部分创建。学生无需填写 API。</span>
          <button disabled={isSubmitting} type="submit">{isSubmitting ? "正在批量创建…" : "创建这批学生"}</button>
        </div>
      </form>
      {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-feedback is-success" role="status">{notice}</p> : null}
    </section>
  );
}
