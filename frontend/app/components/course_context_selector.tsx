"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  getCourseCatalog,
  saveCourseContext,
  type CourseCatalogEntry,
} from "../student-api";
import { DAILY_MATH_TASK_ID } from "../student-data";
import { useLearningProgress } from "./learning_progress_provider";
import { isSubjectEnabled } from "../subject-visibility.js";

type CourseContextSelectorProps = {
  /** 页面已被课程门禁阻断时使用更直接的文案。 */
  required?: boolean;
  className?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "课程内容暂时无法读取，请稍后重试。";
}

function getInitialCourse(catalog: CourseCatalogEntry[], courseId: string | null) {
  return catalog.find((course) => course.id === courseId) ?? catalog[0] ?? null;
}

/**
 * 课程、章节和知识点均来自服务端课程目录。
 * 未导入的教材或学科不会伪装成可选择、可完成的学习内容。
 */
export function CourseContextSelector({ required = false, className = "" }: CourseContextSelectorProps) {
  const { courseContext, refreshLearningData, tasks } = useLearningProgress();
  const [catalog, setCatalog] = useState<CourseCatalogEntry[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [selectedKnowledgePointIds, setSelectedKnowledgePointIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const initializedSignatureRef = useRef("");

  const currentCourse = useMemo(
    () => catalog.find((course) => course.id === selectedCourseId) ?? null,
    [catalog, selectedCourseId],
  );
  const currentChapter = useMemo(
    () => currentCourse?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null,
    [currentCourse, selectedChapterId],
  );
  const frozenMathTask = tasks.find((task) => task.id === DAILY_MATH_TASK_ID && task.status !== "not_started") ?? null;

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");
    void getCourseCatalog().then((nextCatalog) => {
      if (!active) return;
      setCatalog(nextCatalog);
      if (!nextCatalog.length) setError("当前还没有导入可选择的课程内容，请联系教师后再试。");
    }).catch((requestError) => {
      if (active) setError(errorMessage(requestError));
    }).finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!catalog.length) return;
    const course = getInitialCourse(catalog, courseContext?.courseId ?? null);
    if (!course) return;
    const preferredChapter = course.chapters.find((chapter) => chapter.id === courseContext?.chapterId)
      ?? course.chapters[0]
      ?? null;
    if (!preferredChapter) return;

    const signature = [
      courseContext?.courseId ?? "new",
      courseContext?.chapterId ?? "new",
      courseContext?.knowledgePoints.map((point) => point.id).join(",") ?? "",
      catalog.map((item) => item.id).join(","),
    ].join("|");
    if (initializedSignatureRef.current === signature) return;
    initializedSignatureRef.current = signature;
    setSelectedCourseId(course.id);
    setSelectedChapterId(preferredChapter.id);
    setSelectedKnowledgePointIds(
      courseContext?.courseId === course.id && courseContext.chapterId === preferredChapter.id
        ? courseContext.knowledgePoints.map((point) => point.id)
        : [],
    );
  }, [catalog, courseContext]);

  function selectCourse(courseId: string) {
    const course = catalog.find((item) => item.id === courseId) ?? null;
    const chapter = course?.chapters[0] ?? null;
    setSelectedCourseId(courseId);
    setSelectedChapterId(chapter?.id ?? "");
    setSelectedKnowledgePointIds([]);
    setError("");
    setNotice("");
  }

  function selectChapter(chapterId: string) {
    setSelectedChapterId(chapterId);
    setSelectedKnowledgePointIds([]);
    setError("");
    setNotice("");
  }

  function toggleKnowledgePoint(knowledgePointId: string) {
    setSelectedKnowledgePointIds((current) => (
      current.includes(knowledgePointId)
        ? current.filter((id) => id !== knowledgePointId)
        : [...current, knowledgePointId]
    ));
    setError("");
    setNotice("");
  }

  async function handleSave() {
    if (!currentCourse || !currentChapter || !selectedKnowledgePointIds.length) {
      setError("请至少选择一个已经导入的知识点。");
      return;
    }
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      await saveCourseContext({
        chapterId: currentChapter.id,
        courseId: currentCourse.id,
        knowledgePointIds: selectedKnowledgePointIds,
      });
      const refreshed = await refreshLearningData();
      if (!refreshed) {
        setError("课程内容已经保存，但今天的任务暂时无法刷新。请稍后点击“确认课程内容”重试，不要把旧页面当作新任务。");
        return;
      }
      setNotice(frozenMathTask
        ? "课程内容已保存。当前已开始的数学任务会按原来的课程快照继续，新选择用于尚未开始的任务或下一次学习。"
        : "课程内容已保存，今天尚未开始的真实学习任务已经更新。");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={`course-context-selector ${className}`.trim()} aria-labelledby="course-context-title">
      <div className="course-context-heading">
        <p>学科入口：<Link href="/subjects/math">数学</Link>{isSubjectEnabled("英语") && <> · <Link href="/subjects/english">英语单元学习</Link></>}{isSubjectEnabled("语文") && <> · <Link href="/subjects/chinese">语文单元学习</Link></>}</p>
        <p>{required ? "先选择课程内容" : "当前课程内容"}</p>
        <h2 id="course-context-title">{required ? "今天想诊断哪些课堂内容？" : "调整今天要诊断的内容"}</h2>
        <span>选择老师已准备好的教材和知识点。找不到的课程请联系老师；已经开始的任务会保留原来的学习内容。</span>
      </div>

      {isLoading ? <p role="status">正在读取已导入的课程目录…</p> : null}
      {!isLoading && catalog.length ? (
        <div className="course-context-form">
          <label>
            教材与学科
            <select onChange={(event) => selectCourse(event.target.value)} value={selectedCourseId}>
              {catalog.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.subject} · {course.textbookVersion} · {course.grade}年级{course.semester}
                </option>
              ))}
            </select>
          </label>
          {currentCourse ? (
            <label>
              章节
              <select onChange={(event) => selectChapter(event.target.value)} value={selectedChapterId}>
                {currentCourse.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title}</option>)}
              </select>
            </label>
          ) : null}
          {currentChapter ? (
            <fieldset>
              <legend>选择一个或多个知识点</legend>
              <div className="course-context-knowledge-points">
                {currentChapter.knowledgePoints.map((point) => (
                  <label key={point.id}>
                    <input
                      checked={selectedKnowledgePointIds.includes(point.id)}
                      onChange={() => toggleKnowledgePoint(point.id)}
                      type="checkbox"
                    />
                    <span>{point.title}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <div className="course-context-actions">
            <span>{selectedKnowledgePointIds.length ? `已选择 ${selectedKnowledgePointIds.length} 个知识点` : "请至少选择一个知识点"}</span>
            <button disabled={isSaving || !selectedKnowledgePointIds.length} onClick={() => void handleSave()} type="button">
              {isSaving ? "正在保存…" : "确认课程内容"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
      {notice ? <p className="form-feedback is-success" role="status">{notice}</p> : null}
    </section>
  );
}
