"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { languageBooks, languageSubjectPath, languageTaskId } from "../language-learning/curriculum";
import { getLanguageProgress, type LanguageProgressEntry } from "../student-api";
import { useLearningProgress } from "./learning_progress_provider";

export function LanguageCurriculumCatalog({ subject }: { subject: "语文" | "英语" }) {
  const books = languageBooks.filter(book => book.subject === subject);
  const [semester, setSemester] = useState("上册");
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<LanguageProgressEntry[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const { tasks, isReady } = useLearningProgress();
  const book = books.find(item => item.semester === semester)!;
  useEffect(() => {
    let active = true;
    setError("");
    void getLanguageProgress().then(result => { if (active) setHistory(result); })
      .catch(() => { if (active) setError("学习记录暂时无法读取，仍可选择内容。恢复连接后可以重试。"); });
    return () => { active = false; };
  }, [retry]);
  const units = book.units.filter(unit => [unit.title, unit.focus, ...(unit.lessons ?? [])].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className={`language-catalog language-${languageSubjectPath(subject)}`} aria-label={`${subject}教材单元`}>
    <header className="language-catalog-toolbar">
      <label>学期<select value={semester} onChange={event => setSemester(event.target.value)}>{books.map(item => <option key={item.id}>{item.semester}</option>)}</select></label>
      <label>查找单元、课文或知识点<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={subject === "语文" ? "例如：狼、亲情、诗歌" : "例如：Family、过去时"} /></label>
      <a href={`/api/materials/${book.id}`} target="_blank" rel="noreferrer">打开本册教材 ↗</a>
    </header>
    <p>{book.edition} · 七年级{book.semester} · {book.units.length} 个单元。选择任意单元即可开始，基础练习无需 API。</p>
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(value => value + 1)}>重新读取记录</button></p> : null}
    <div className="language-unit-grid">
      {units.map((unit, index) => {
        const taskId = languageTaskId(unit.id);
        const today = tasks.find(task => task.id === taskId);
        const record = history.find(item => item.task_id === taskId);
        const label = today?.status === "completed" ? "今日已过关" : today?.status === "in_progress" ? "学习中" : record?.last_completed_at ? "曾完成过关" : "可以开始";
        return <article key={unit.id} className={`language-unit-card language-tone-${index % 3}`}>
          <div className="language-unit-meta"><span>教材第 {unit.page} 页起</span><span>{label}</span></div>
          <h2>{unit.title}</h2><p>{unit.focus}</p>
          {unit.lessons ? <p className="language-lessons">{unit.lessons.join(" · ")}</p> : null}
          <ul className="language-skill-tags">{unit.skills.map(skill => <li key={skill.id}>{skill.title}</li>)}</ul>
          <small>4 道基础首测 · 4 道独立过关题 · 配套讲解与表达练习</small>
          {record?.last_completed_at ? <small>最近过关：{new Date(record.last_completed_at).toLocaleDateString("zh-CN")}</small> : null}
          <Link className="language-primary" href={`/subjects/${languageSubjectPath(subject)}/${unit.id}`}>{isReady && today?.status === "in_progress" ? "继续学习" : today?.status === "completed" ? "查看与复习" : "进入单元"} →</Link>
        </article>;
      })}
    </div>
    {!units.length ? <p role="status">没有找到匹配内容。请换一个关键词，或切换上下册。</p> : null}
    <p className="language-scope-note">本页提供与教材单元配套的原创基础练习。表达练习可按检查提示自评，也可选用 AI 点评；基础过关结果不代表作文或口语已被自动评定。</p>
  </section>;
}
