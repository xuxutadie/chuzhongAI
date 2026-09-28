"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { interactiveLessons, lessonStages, type LessonStage } from "./lesson-catalog";
import { StudentPageShell } from "../components/student_page_shell";

export default function InteractiveLessonsPage() {
  const [selectedStage, setSelectedStage] = useState<LessonStage>("七年级数学");
  const lessons = useMemo(
    () => interactiveLessons.filter((lesson) => lesson.stage === selectedStage),
    [selectedStage]
  );

  return (
    <StudentPageShell
      eyebrow="互动教学"
      title="边操作，边理解数学"
      description="从教材章节进入互动课件。完成探索后写下你的发现，系统才会记录这次学习。"
    >
      <section className="interactive-hub" aria-labelledby="interactive-hub-title">
        <h2 className="resource-section-title" id="interactive-hub-title">选择课程</h2>
        <div className="interactive-stage-tabs" role="tablist" aria-label="互动教学课程阶段">
          {lessonStages.map((stage) => (
            <button
              type="button"
              key={stage}
              role="tab"
              aria-selected={selectedStage === stage}
              onClick={() => setSelectedStage(stage)}
            >
              {stage}
            </button>
          ))}
        </div>
        <p className="interactive-hub-note">可以自由探索。今日任务中的互动演示完成后，请回到原来的学习步骤继续。</p>
        <div className="interactive-lesson-grid">
          {lessons.map((lesson) => {
            const isAvailable = lesson.status === "可学习";
            const card = (
              <>
                <div className="interactive-cover">
                  <Image src={lesson.image} alt="" fill sizes="(max-width: 760px) 100vw, 33vw" />
                  <span className={`interactive-status ${isAvailable ? "is-ready" : "is-unavailable"}`}>{lesson.status}</span>
                </div>
                <div className="interactive-card-body">
                  <small>{lesson.semester} · {lesson.chapter} · {lesson.source}</small>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.description}</p>
                  <div className="interactive-point-list">
                    {lesson.keyPoints.slice(0, 3).map((point) => <span key={point}>{point}</span>)}
                  </div>
                  <strong>{isAvailable ? "开始互动学习" : "课件准备中"}</strong>
                </div>
              </>
            );

            return isAvailable ? (
              <Link className="interactive-lesson-card" href={`/interactive-lessons/${lesson.id}`} key={lesson.id}>{card}</Link>
            ) : <article className="interactive-lesson-card is-disabled" key={lesson.id}>{card}</article>;
          })}
        </div>
      </section>
    </StudentPageShell>
  );
}
