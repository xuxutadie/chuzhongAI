"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { diagnosisApi, needsSchoolSupplement, type DiagnosisState } from "../diagnosis/model";
import { useStudentSession } from "./student_session_provider";

export function SchoolProfileNotice() {
  const { user } = useStudentSession();
  const [owner, setOwner] = useState<number | null>(null);
  useEffect(() => {
    setOwner(null);
    if (!user || user.role !== "student") return;
    const controller = new AbortController();
    diagnosisApi<DiagnosisState>("", undefined, "GET", controller.signal).then(data => {
      if (!controller.signal.aborted && needsSchoolSupplement(data.profile)) setOwner(user.id);
    }).catch(() => {});
    return () => controller.abort();
  }, [user?.id, user?.role]);
  if (!user || owner !== user.id) return null;
  return <aside className="state-banner"><span>补充学校和班级，方便老师核对认领。不会影响今天的学习进度。</span> <Link href="/profile">补充资料 →</Link></aside>;
}
