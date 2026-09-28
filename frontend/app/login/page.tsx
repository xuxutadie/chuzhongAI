"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useStudentSession } from "../components/student_session_provider";
import { getRoleDestination, getSafeNextPath } from "../student-session-model";
import { buildTeacherRegistration, registerTeacher } from "../teacher/api";
import { bootstrapAdmin, login, registerStudent, StudentApiError } from "../student-api";
import { buildStudentRegistration, getRegistrationDestination, type LoginMode } from "../student-registration-model";
import styles from "./login-blueprint.module.css";
import { LoginIntroduction } from "./login_introduction";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className={styles.screen} aria-busy="true">正在准备登录页面…</main>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { error: sessionError, setAuthenticatedUser, status, user } = useStudentSession();
  const [mode, setMode] = useState<LoginMode>("login");
  const [setupRequired, setSetupRequired] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [grade, setGrade] = useState("七年级");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [school, setSchool] = useState("");
  const [classes, setClasses] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const destinationRef = useRef<string | null>(null);
  const nextPath = useMemo(() => getSafeNextPath(searchParams.get("next")), [searchParams]);
  const visibleError = error || (!isSubmitting ? sessionError ?? "" : "");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/setup-status", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (!controller.signal.aborted) setSetupRequired(value?.setup_required === true); })
      .catch(() => { /* 无法确认时不显示首次设置入口，避免误导。 */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(destinationRef.current ?? getRoleDestination(user.role, nextPath));
    }
  }, [nextPath, router, status, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setIsSubmitting(true);
    try {
      const authenticatedUser = mode === "bootstrap"
        ? await bootstrapAdmin({ username, password, displayName, setupCode })
        : mode === "register"
        ? await registerStudent(buildStudentRegistration({ username, password, confirmPassword, displayName, grade }))
        : mode === "teacher-register"
        ? await registerTeacher(buildTeacherRegistration({ username, password, confirmPassword, displayName, school, classes }))
        : await login({ username, password });
      // 先确定跳转再更新会话，避免 authenticated effect 把新学生送回首页。
      const destination = getRegistrationDestination(mode, nextPath, authenticatedUser.role);
      destinationRef.current = destination;
      setPassword("");
      setConfirmPassword("");
      setAuthenticatedUser(authenticatedUser);
      router.replace(destination);
    } catch (requestError) {
      if (requestError instanceof StudentApiError && requestError.status === 409 && mode === "bootstrap") {
        setError("教师账号已经设置完成，请切换到“账号登录”。");
      } else {
        setError(requestError instanceof Error ? requestError.message : "登录失败，请稍后重试。");
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.shell}>
      <LoginIntroduction />

      <section className={styles.panel} aria-label="账号登录与注册">
        <div className={styles.panelHeading}>
          <span className={styles.entryLabel}>账号入口</span>
          <h2>{mode === "teacher-register" ? "建立你的教学空间" : mode === "bootstrap" ? "首次设置管理员" : mode === "register" ? "建立自己的学习空间" : "欢迎回来"}</h2>
          <p>{mode === "teacher-register" ? "注册后，通过学生分享的认领码查看学情。" : mode === "bootstrap" ? "仅由系统负责人执行一次。" : mode === "register" ? "独立学习，使用自己的 AI 服务。" : "准备好了，就从这里继续。"}</p>
        </div>
        <div className={styles.segmentedControl} role="tablist" aria-label="登录方式">
          <button
            aria-selected={mode === "login"}
            disabled={isSubmitting}
            onClick={() => { setMode("login"); setError(""); setPassword(""); setConfirmPassword(""); }}
            role="tab"
            type="button"
          >
            账号登录
          </button>
          {setupRequired && <button
            aria-selected={mode === "bootstrap"}
            disabled={isSubmitting}
            onClick={() => { setMode("bootstrap"); setError(""); setPassword(""); setConfirmPassword(""); }}
            role="tab"
            type="button"
          >
            管理员初始化
          </button>}
          <button
            aria-selected={mode === "register"}
            disabled={isSubmitting}
            onClick={() => { setMode("register"); setError(""); setPassword(""); setConfirmPassword(""); }}
            role="tab"
            type="button"
          >学生注册</button>
          <button aria-selected={mode === "teacher-register"} disabled={isSubmitting} role="tab" type="button"
            onClick={() => { setMode("teacher-register"); setError(""); setPassword(""); setConfirmPassword(""); }}>教师注册</button>
        </div>

        <form aria-busy={isSubmitting} className={styles.form} onSubmit={handleSubmit}>
          {mode === "bootstrap" ? (
            <p className={styles.formHint}>首次设置只会成功一次。完成后，可在教师工作台创建学生账号。本机启动可不填初始化码；公开部署时请填写服务器预设的一次性初始化码。</p>
          ) : mode === "teacher-register" ? (
            <p className={styles.registrationNotice}>学校和班级为自填信息，不代表学校认证。只有学生主动分享认领码后，你才能查看其学情；关联不会更改学生的 AI 服务或费用归属。</p>
          ) : mode === "register" ? (
            <p className={styles.registrationNotice}>自主注册需要自行配置 AI 与拍照识题 API，使用费用由你的服务商账号承担，请先和家长确认。暂时没有 API 也能完成本地练习、手动整理错题。老师发放的账号由老师统一配置，无需自行填写。</p>
          ) : (
            <p className={styles.formHint}>学生和教师都在这里用自己的账号登录。</p>
          )}
          {mode !== "login" ? (
            <label>
              {mode === "register" ? "学生称呼" : "教师或家长称呼"}
              <input
                autoComplete="name"
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={40}
                placeholder={mode === "register" ? "例如：小林（无需真实姓名）" : "例如：王老师"}
                required
                value={displayName}
              />
            </label>
          ) : null}
          {mode === "register" ? (
            <label>年级
              <select onChange={(event) => setGrade(event.target.value)} value={grade}>
                <option>六年级</option><option>升七年级</option><option>七年级</option><option>八年级</option><option>九年级</option>
              </select>
            </label>
          ) : null}
          {mode === "teacher-register" && <>
            <label>学校全称<input required maxLength={100} value={school} onChange={event => setSchool(event.target.value)} placeholder="例如：实验中学" /></label>
            <label>任教班级<input required maxLength={840} value={classes} onChange={event => setClasses(event.target.value)} placeholder="例如：七年级1班、七年级2班" /></label>
          </>}
          <label>
            {mode === "bootstrap" ? "管理员账号" : "账号"}
            <input
              autoCapitalize="none"
              autoComplete="username"
              minLength={3}
              maxLength={64}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3 至 64 个非空白字符"
              required
              value={username}
            />
          </label>
          <label>
            密码
            <input
              autoComplete={mode !== "login" ? "new-password" : "current-password"}
              minLength={8}
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 个字符"
              required
              type="password"
              value={password}
            />
          </label>
          {mode === "register" || mode === "teacher-register" ? (
            <label>确认密码
              <input autoComplete="new-password" minLength={8} maxLength={256} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" required type="password" value={confirmPassword} />
            </label>
          ) : null}
          {mode === "bootstrap" ? (
            <label>
              首次初始化码（公开部署时需要）
              <input
                autoComplete="one-time-code"
                onChange={(event) => setSetupCode(event.target.value)}
                placeholder="本机开发可留空"
                type="password"
                value={setupCode}
              />
            </label>
          ) : null}
          <button className={styles.submitButton} disabled={isSubmitting} type="submit">
            {isSubmitting ? "正在提交，请稍候…" : mode === "teacher-register" ? "注册并进入教师工作台" : mode === "bootstrap" ? "创建管理员账号" : mode === "register" ? "注册并开始学习建档" : "登录学习工作台"}
          </button>
          {visibleError ? <p className={styles.error} role="alert">{visibleError}</p> : null}
          <p className={styles.securityNote}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m12 3 7 3v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>学习记录随账号保存，共用设备使用后请退出账号。</span>
          </p>
        </form>
      </section>
      </div>
    </main>
  );
}
