"use client";

import Link from "next/link";
import { useState } from "react";
import { getAvailableCourses } from "../math-learning/course-catalog";
import { mathKnowledgePackages } from "../math-learning/knowledge-registry";
import { MathSelfCheckQuestion } from "./math_self_check_question";

const chapters = getAvailableCourses(mathKnowledgePackages)[0].chapters;

/** 随时可读的复习资料，与会计入成长值的正式诊断明确分开。 */
export function MathCurriculumReview() {
  const [chapterId, setChapterId] = useState(chapters[0].id);
  const [pointId, setPointId] = useState(chapters[0].knowledgePointIds[0]);
  const packs = mathKnowledgePackages.filter(pack => pack.chapterId === chapterId);
  const pack = packs.find(item => item.id === pointId) ?? packs[0];
  return (
    <section className="math-text-study">
      <p className="workbench-inline-note"><span>自由复习不改变今日任务，也不计成长值。</span><Link href="/dashboard">继续今日学习 →</Link></p>
      <div className="course-context-form">
        <label>复习章节
          <select value={chapterId} onChange={event => {
            const chapter = chapters.find(item => item.id === event.target.value);
            if (chapter) { setChapterId(chapter.id); setPointId(chapter.knowledgePointIds[0]); }
          }}>
            {chapters.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
          </select>
        </label>
        <label>复习知识点
          <select value={pack.id} onChange={event => setPointId(event.target.value)}>
            {packs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
      </div>
      <section className="math-study-guide" key={pack.id}>
        <h2>{pack.title}</h2>
        {pack.learningGuide ? <>
          <ol>{pack.learningGuide.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <h3>易错提醒</h3>
          <ul>{pack.learningGuide.pitfalls.map(item => <li key={item}>{item}</li>)}</ul>
        </> : <>
          <p>本知识点配有立体图形互动，可通过旋转、折叠等方式观察，再回来复习下方文字题。</p>
          <Link href="/interactive-lessons/g7-upper-shapes">打开第一章互动课件</Link>
        </>}
      </section>
      <section className="math-study-review" key={`${pack.id}-questions`}>
        <h2>自查练习</h2>
        <p>选择答案，提交后查看对错与解析。答错会加入错题集，不改变今日任务进度。</p>
        {pack.questions.filter(q => q.responseType !== "interactive").map((question, index) =>
          <MathSelfCheckQuestion key={question.id} question={question} knowledgePointId={pack.id} index={index} />)}
      </section>
    </section>
  );
}
