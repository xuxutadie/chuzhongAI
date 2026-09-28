"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { askStudentAssistant } from "../ai-runtime-client";
import { completeTodayTask, createWrongQuestion, getWorkspaceEntry, startTodayTask, type TodayTask } from "../student-api";
import { scheduleLanguageDraftSync } from "../language-learning/draft-sync";
import { assertLanguageSessionDay, gradeLanguageAnswers, languageSubjectPath, languageTaskId,
  resolveLanguageSessionAccess, restoreLanguageDraft, startLanguageSessionForDay,
  type LanguageBook, type LanguageDraft, type LanguageQuestion, type LanguageUnit } from "../language-learning/curriculum";
import { useLearningProgress } from "./learning_progress_provider";
import { useStudentSession } from "./student_session_provider";

function dateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function message(error: unknown) { return error instanceof Error ? error.message : "暂时无法连接，请重试。"; }
function answerText(q: LanguageQuestion, answer: string | undefined) { return q.options.find(option => option.id === answer)?.text ?? "未作答"; }

/** 单元和账号切换后重建会话，避免沿用前一份作答。React 官方状态隔离说明：
 * https://react.dev/learn/preserving-and-resetting-state#resetting-state-with-a-key */
export function LanguageUnitSession({ book, unit }: { book: LanguageBook; unit: LanguageUnit }) {
  const { storageNamespace } = useLearningProgress();
  return <UnitSession key={`${storageNamespace}:${unit.id}`} book={book} unit={unit} />;
}

function UnitSession({ book, unit }: { book: LanguageBook; unit: LanguageUnit }) {
  const { tasks, isReady, isWorkspaceReady, workspaceState, workspaceWarning, syncWarning,
    storageNamespace, saveWorkspaceEntry, refreshLearningData } = useLearningProgress();
  const { user } = useStudentSession();
  const [day] = useState(dateKey);
  const taskId = languageTaskId(unit.id);
  const draftKey = `${day}:${unit.id}`;
  const localKey = `${storageNamespace}:language-unit:${draftKey}`;
  const [draft, setDraft] = useState<LanguageDraft>(() => restoreLanguageDraft(unit, null));
  const [loaded, setLoaded] = useState(false);
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const [confirmedTask, setConfirmedTask] = useState<TodayTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localWarning, setLocalWarning] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [activeSkill, setActiveSkill] = useState("");
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [aiReply, setAiReply] = useState("");
  const [aiError, setAiError] = useState("");
  const [asking, setAsking] = useState(false);
  const submitting = useRef(false);
  const task = confirmedTask ?? tasks.find(item => item.id === taskId) ?? null;
  const sessionAccess = resolveLanguageSessionAccess(task?.status ?? null, hasStoredDraft, Boolean(syncWarning));
  const started = sessionAccess === "started";
  const completed = sessionAccess === "completed";
  const offlineDraft = sessionAccess === "offline-draft";
  const diagnosis = gradeLanguageAnswers(unit.questions, draft.diagnosis);
  const retest = gradeLanguageAnswers(unit.retestQuestions, draft.retest);
  const subjectPath = `/subjects/${languageSubjectPath(book.subject)}`;

  useEffect(() => {
    if (!isWorkspaceReady || loaded) return;
    let local: unknown = null;
    try { local = JSON.parse(localStorage.getItem(localKey) ?? "null"); } catch { /* 本机草稿不可读时仍可用服务端草稿。 */ }
    const stored = getWorkspaceEntry<LanguageDraft>(workspaceState, "languageUnitDrafts", draftKey) ?? local;
    setHasStoredDraft(stored !== null && stored !== undefined);
    setDraft(restoreLanguageDraft(unit, stored));
    setLoaded(true);
  }, [draftKey, isWorkspaceReady, loaded, localKey, unit, workspaceState]);

  useEffect(() => {
    if (!loaded || (!started && !completed && !offlineDraft)) return;
    try { localStorage.setItem(localKey, JSON.stringify(draft)); }
    catch { setLocalWarning("本机备用草稿无法保存，请确认下方没有服务器同步错误后再离开。"); }
    return scheduleLanguageDraftSync(() => {
      void saveWorkspaceEntry("languageUnitDrafts", draftKey, draft);
    });
  }, [completed, draft, draftKey, loaded, localKey, offlineDraft, saveWorkspaceEntry, started]);

  function update(patch: Partial<LanguageDraft>) { setDraft(value => ({ ...value, ...patch })); setError(""); }
  async function begin() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const next = await startLanguageSessionForDay(day, dateKey(), () => startTodayTask(taskId));
      if (!next) throw new Error("未能确认单元开始，请重试。");
      setConfirmedTask(next); setReviewOnly(false);
      await refreshLearningData();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); submitting.current = false; }
  }

  async function finish() {
    if (submitting.current || !retest.allCorrect || draft.reflection.trim().length < 12) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      assertLanguageSessionDay(day, dateKey());
      // 先确认表达练习和草稿已保存，再请求服务端核验过关；失败可以原地重试。
      if (!await saveWorkspaceEntry("languageUnitDrafts", draftKey, draft)) throw new Error("草稿还未保存到服务器，请恢复连接后重试保存。");
      const result = await completeTodayTask(taskId, draft.reflection, {
        kind: "language_unit", diagnosis_answers: draft.diagnosis, answers: draft.retest,
      });
      if (!result.task || result.task.status !== "completed") throw new Error("服务器未确认完成，请重新保存。");
      setConfirmedTask(result.task);
      await refreshLearningData();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); submitting.current = false; }
  }

  async function collect(q: LanguageQuestion, answer: string | undefined) {
    if (submitting.current || savedQuestions.includes(q.id)) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      await createWrongQuestion({ subject: book.subject,
        question_text: `${book.semester} ${unit.title}\n${q.prompt}\n${q.options.map(o => `${o.id.toUpperCase()}. ${o.text}`).join("\n")}`,
        knowledge_points: [unit.title, unit.skills.find(s => s.id === q.skillId)!.title],
        error_reason: `本次选择：${answerText(q, answer)}。正确答案：${answerText(q, q.answer)}。${q.explanation}`,
      });
      setSavedQuestions(value => [...value, q.id]);
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); submitting.current = false; }
  }

  async function reviewWriting() {
    if (!draft.writing.trim() || asking) return;
    setAsking(true); setAiError(""); setAiReply("");
    try {
      const reply = await askStudentAssistant(`请作为七年级${book.subject}老师点评以下表达练习。单元：${unit.title}。要求：${unit.writingPrompt}。先指出一项优点，再给两条具体修改建议，核对语句与主题，不代写全文，不宣称已经正式评分。学生习作如下：\n${draft.writing.slice(0, 1400)}`);
      setAiReply(reply.reply || "本次没有返回点评，请重试。");
    } catch (failure) { setAiError(message(failure)); }
    finally { setAsking(false); }
  }

  function questions(bank: LanguageQuestion[], answers: Record<string, string>, kind: "diagnosis" | "retest") {
    return <div className="language-question-list">{bank.map((q, index) => <fieldset className="language-question" key={q.id}>
      <legend><span>{index + 1}. {unit.skills.find(skill => skill.id === q.skillId)?.title}</span><strong>{q.prompt}</strong></legend>
      {q.options.map(option => <label key={option.id} className={answers[q.id] === option.id ? "is-selected" : ""}>
        <input type="radio" name={q.id} value={option.id} checked={answers[q.id] === option.id} onChange={() => update({ [kind]: { ...answers, [q.id]: option.id } })} />
        <span>{option.id.toUpperCase()}. {option.text}</span>
      </label>)}
    </fieldset>)}</div>;
  }
  function reviewQuestions(bank: LanguageQuestion[], answers: Record<string, string>) {
    return <div className="language-question-list">{bank.map(q => <article className="language-review-card" key={q.id}>
      <h3>{q.prompt}</h3>
      <ul>{q.options.map(o => <li key={o.id}>{o.id.toUpperCase()}. {o.text}</li>)}</ul>
      <p>你的答案：{answerText(q, answers[q.id])} · 正确答案：{answerText(q, q.answer)}</p>
      <p>{q.explanation}</p>
      {answers[q.id] !== q.answer ? <button disabled={busy || savedQuestions.includes(q.id)} onClick={() => void collect(q, answers[q.id])} type="button">{savedQuestions.includes(q.id) ? "已加入错题集" : "加入错题集"}</button> : null}
    </article>)}</div>;
  }
  function guides() {
    const skills = activeSkill ? unit.skills.filter(skill => skill.id === activeSkill) : unit.skills;
    return <section className="language-guides" aria-label="知识点讲解">
      <label>选择要复习的知识点<select value={activeSkill} onChange={e => setActiveSkill(e.target.value)}><option value="">全部知识点</option>{unit.skills.map(skill => <option key={skill.id} value={skill.id}>{skill.title}</option>)}</select></label>
      {skills.map(skill => <article key={skill.id}><h3>{skill.title}</h3><p>{skill.guide}</p></article>)}
    </section>;
  }
  function writing() {
    return <section className="language-writing" aria-label="表达练习">
      <h2>用自己的话表达</h2><p>{unit.writingPrompt}</p>
      <label>我的表达练习<textarea rows={6} maxLength={1400} value={draft.writing} onChange={e => update({ writing: e.target.value })} placeholder="先自己写，再对照下面的提示修改。" /></label>
      <p>自查：是否切合题目？是否有具体内容或依据？语句是否通顺、前后是否一致？</p>
      <button type="button" disabled={asking || !draft.writing.trim()} onClick={() => void reviewWriting()}>{asking ? "正在请求点评…" : "请 AI 点评这段表达（可选）"}</button>
      <p>{user?.ai_access_mode === "personal" ? "使用你在“我的 AI 设置”中填写的服务。" : "使用老师统一提供的 AI 服务。"}<Link href="/ai-settings">查看 API 设置</Link>。点评只提供建议，不影响基础练习判分。</p>
      {aiError ? <p role="alert">{aiError}</p> : null}
      {aiReply ? <div className="language-ai-reply" role="status">{aiReply}</div> : null}
    </section>;
  }

  if (!isReady || !isWorkspaceReady || !loaded) return <p role="status">正在读取本单元学习记录…</p>;
  return <section className={`language-session language-${languageSubjectPath(book.subject)}`}>
    <div className="language-session-links"><Link href={subjectPath}>← 返回单元目录</Link><a href={`/api/materials/${book.id}#page=${unit.pdfPage}`} target="_blank" rel="noreferrer">对照教材 ↗</a><Link href="/wrong-questions">查看错题集</Link></div>
    {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
    {localWarning || workspaceWarning ? <p role="alert">{localWarning || workspaceWarning}</p> : null}
    {syncWarning ? <p role="status">{syncWarning}</p> : null}
    {offlineDraft ? <section className="language-introduction" aria-labelledby="language-offline-draft-title">
      <h2 id="language-offline-draft-title">已恢复本机草稿</h2>
      <p role="status">你可以继续填写和复习；当前还没有重新取得服务器任务状态，联网确认前不能提交过关记录。</p>
      <div className="language-actions"><button type="button" disabled={busy} onClick={() => void begin()}>{busy ? "正在重新连接…" : "重新连接并确认本单元"}</button></div>
    </section> : null}
    {!started && !completed && !offlineDraft && !reviewOnly ? <section className="language-introduction">
      <h2>{book.subject} · {book.semester} · {unit.title}</h2><p>{unit.focus}</p>
      {unit.lessons ? <p>本单元课文：{unit.lessons.join("、")}</p> : null}
      <ul>{unit.skills.map(skill => <li key={skill.id}>{skill.title}</li>)}</ul>
      <p>先完成 4 道基础首测，复习讲解，再做 4 道不同的过关题。全部答对并写下学习反思后，本单元记为基础练习过关，今日获得 20 成长值。</p>
      <div className="language-actions"><button type="button" disabled={busy} onClick={() => void begin()}>{busy ? "正在开始…" : "开始本单元学习"}</button><button type="button" onClick={() => setReviewOnly(true)}>先看知识讲解</button></div>
    </section> : null}
    {reviewOnly && !started && !completed && !offlineDraft ? <><p>自由查看讲解不会记为过关。</p>{guides()}<button type="button" disabled={busy} onClick={() => void begin()}>开始本单元学习</button></> : null}
    {completed ? <>
      <section className="language-completed" role="status"><h2>本单元基础练习已过关</h2><p>完成记录已保存，今日同一单元不会重复获得成长值。你可以继续复习，也可以返回目录选择其他单元。</p><p>学习反思：{task?.reflection}</p><Link href={subjectPath}>选择其他单元 →</Link></section>
      {guides()}{writing()}
      <details><summary>查看全部练习与讲解</summary>{reviewQuestions(unit.questions, draft.diagnosis)}{reviewQuestions(unit.retestQuestions, draft.retest)}</details>
    </> : null}
    {(started || offlineDraft) && !completed ? <>
      <ol className="language-steps" aria-label="学习步骤">{["基础首测", "诊断与复习", "独立过关", "保存结果"].map((title, i) => <li key={title} aria-current={i === ["diagnosis", "study", "retest", "result"].indexOf(draft.phase) ? "step" : undefined}>{i + 1}. {title}</li>)}</ol>
      {draft.phase === "diagnosis" ? <><h2>基础首测</h2>{questions(unit.questions, draft.diagnosis, "diagnosis")}<button disabled={diagnosis.answered !== unit.questions.length} type="button" onClick={() => update({ phase: "study" })}>完成首测，查看诊断（{diagnosis.answered}/{unit.questions.length}）</button></> : null}
      {draft.phase === "study" ? <>
        <h2>首测答对 {diagnosis.correct}/{unit.questions.length} 题</h2>
        <p>{diagnosis.wrong.length ? `优先复习：${diagnosis.wrong.map(q => unit.skills.find(s => s.id === q.skillId)!.title).join("、")}` : "基础首测全部答对。再用新题检查是否能够迁移运用。"}</p>
        {reviewQuestions(diagnosis.wrong, draft.diagnosis)}{guides()}{writing()}
        <label className="language-confirm"><input type="checkbox" checked={draft.reviewed} onChange={e => update({ reviewed: e.target.checked })} />我已对照讲解复习，准备做新的过关题</label>
        <button type="button" disabled={!draft.reviewed} onClick={() => update({ phase: "retest" })}>开始独立过关测试</button>
      </> : null}
      {draft.phase === "retest" ? <><h2>独立过关测试</h2>{questions(unit.retestQuestions, draft.retest, "retest")}<button type="button" disabled={retest.answered !== unit.retestQuestions.length} onClick={() => update({ phase: "result" })}>检查过关答案（{retest.answered}/{unit.retestQuestions.length}）</button></> : null}
      {draft.phase === "result" ? <>
        <h2>过关题答对 {retest.correct}/{unit.retestQuestions.length} 题</h2>
        {!retest.allCorrect ? <>{reviewQuestions(retest.wrong, draft.retest)}<p>看懂错误原因后再试一次；当前还未记为过关。</p><button type="button" onClick={() => update({ phase: "study", retest: {}, reviewed: false })}>返回讲解后重试</button></> : <>
          <p>基础题已全部答对。请写下学会的方法或接下来要练习的地方，再保存完成记录。</p>
          <label className="language-reflection">学习反思（至少 12 个字）<textarea rows={4} maxLength={1000} value={draft.reflection} onChange={e => update({ reflection: e.target.value })} /></label>
          <button type="button" disabled={busy || offlineDraft || draft.reflection.trim().length < 12} onClick={() => void finish()}>{offlineDraft ? "联网确认任务后再保存" : busy ? "正在保存…" : "保存本单元完成记录"}</button>
        </>}
      </> : null}
    </> : null}
  </section>;
}
