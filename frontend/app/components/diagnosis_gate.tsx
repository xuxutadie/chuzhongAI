"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStudentSession } from "./student_session_provider";
import { diagnosisApi, needsInitialDiagnosis, type DiagnosisState } from "../diagnosis/model";

/** 尚未建档的学生先进入全屏访谈，不能闪现复杂首页。教师不受此流程影响。 */
export function DiagnosisGate({ children }: { children: ReactNode }) {
  const { user, status, logout } = useStudentSession();
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const exempt = ["/login", "/onboarding", "/profile", "/authorizations", "/ai-settings", "/model-config"].includes(path);
  const key = `${user?.id}:${path}`;
  useEffect(() => {
    if (status !== "authenticated" || user?.role !== "student" || exempt) return;
    const controller = new AbortController();
    setError("");
    diagnosisApi<DiagnosisState>("", undefined, "GET", controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (needsInitialDiagnosis(data)) {
        router.replace("/onboarding");
      } else setReady(key);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message || "暂时无法读取学习档案。"); });
    return () => controller.abort();
  }, [key, status, user?.role, exempt, retry, router]);
  if (user?.role !== "student" || exempt || ready === key) return children;
  return <main className="student-workbench student-workbench-loading"><section>
    <h1>准备你的数学学习空间</h1>
    <p role={error ? "alert" : "status"}>{error || "正在读取学习档案…"}</p>
    {error && <><button type="button" onClick={() => setRetry(n => n + 1)}>重新连接</button><button type="button" onClick={() => void logout()}>退出登录</button></>}
  </section></main>;
}
