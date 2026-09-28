"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getWrongQuestion, updateWrongQuestion, deleteWrongQuestion, type WrongQuestion } from "../student-api";
import { WrongQuestionRecordCard } from "./wrong_question_record_card";

/** 复用原有编辑与二次确认删除，只维护单题，不再显示第二份错题列表。 */
export function WrongQuestionMaintenance({ questionId }: { questionId: number }) {
  const router = useRouter();
  const [record, setRecord] = useState<WrongQuestion | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setRecord(null);
    setError("");
    getWrongQuestion(questionId).then(value => { if (active) setRecord(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "读取失败，请重试。"); });
    return () => { active = false; };
  }, [questionId, reload]);
  return <section aria-label="维护原题">
    <p className="workspace-footnote">修改题目后，需要重新核实答案与分析。历史作答记录仍会保留。</p>
    {error ? <p role="alert">{error} <button onClick={() => setReload(value => value + 1)}>重试</button></p> : !record ? <p role="status">正在读取这道错题…</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {record ? <WrongQuestionRecordCard record={record} integrations={null} isAnalyzing={false} isDeleting={deleting} showAnalysisAction={false}
      onAnalyze={async () => { router.push(`/wrong-questions/${questionId}`); }}
      onUpdate={async (id, input) => { setRecord(await updateWrongQuestion(id, input)); setNotice("修改已保存，可返回题目重新核实与整理。"); }}
      onDelete={async id => { setDeleting(true); try { await deleteWrongQuestion(id); router.replace("/wrong-questions"); } finally { setDeleting(false); } }} /> : null}
    <div className="workspace-action-group"><Link className="workspace-button secondary" href={`/wrong-questions/${questionId}`}>返回这道题</Link><Link className="workspace-button secondary" href="/wrong-questions">返回错题集</Link></div>
  </section>;
}
