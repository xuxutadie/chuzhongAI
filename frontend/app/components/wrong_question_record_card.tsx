"use client";

import { useEffect, useState } from "react";

import type {
  IntegrationStatus,
  WrongQuestion,
  WrongQuestionInput,
} from "../student-api";
import { buildProtectedImageUrl } from "../student-api";
import {
  getWrongQuestionImagePath,
  splitKnowledgePoints,
  type WrongQuestionSubject,
} from "../wrong-questions/wrong_question_model.js";

type WrongQuestionRecordCardProps = {
  record: WrongQuestion;
  integrations: IntegrationStatus | null;
  isAnalyzing: boolean;
  isDeleting: boolean;
  showAnalysisAction?: boolean;
  onAnalyze: (questionId: number) => Promise<void>;
  onDelete: (questionId: number) => Promise<void>;
  onUpdate: (questionId: number, input: Omit<WrongQuestionInput, "source_upload_id" | "error_reason"> & {
    error_reason?: string | null;
  }) => Promise<void>;
};

type EditorState = {
  subject: WrongQuestionSubject;
  questionText: string;
  knowledgePointsText: string;
  errorReason: string;
};

const subjects: WrongQuestionSubject[] = ["数学", "英语", "语文"];

function createEditorState(record: WrongQuestion): EditorState {
  return {
    subject: subjects.includes(record.subject as WrongQuestionSubject)
      ? record.subject as WrongQuestionSubject
      : "数学",
    questionText: record.questionText,
    knowledgePointsText: record.knowledgePoints.join("、"),
    errorReason: record.errorReason ?? "",
  };
}

function toMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚保存";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** 单条错题支持展开查看、改正文本、请求分析和二次确认删除。 */
export function WrongQuestionRecordCard({
  record,
  integrations,
  isAnalyzing,
  isDeleting,
  onAnalyze,
  onDelete,
  onUpdate,
  showAnalysisAction = true,
}: WrongQuestionRecordCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(record));

  useEffect(() => {
    setEditor(createEditorState(record));
    setIsEditing(false);
    setIsExpanded(false);
    setEditorError("");
    setImageFailed(false);
  }, [record.id, record.updatedAt]);

  async function handleSaveEdit() {
    const questionText = editor.questionText.trim();
    if (!questionText) {
      setEditorError("题目文字不能为空。请补充后再保存修改。");
      return;
    }

    setEditorError("");
    setIsSaving(true);
    try {
      await onUpdate(record.id, {
        subject: editor.subject,
        question_text: questionText,
        knowledge_points: splitKnowledgePoints(editor.knowledgePointsText),
        error_reason: editor.errorReason.trim() || null,
      });
      setIsEditing(false);
    } catch (error) {
      setEditorError(toMessage(error, "修改保存失败，请稍后重试。"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await onDelete(record.id);
    } catch (error) {
      setEditorError(toMessage(error, "删除失败，请稍后重试。"));
      setIsConfirmingDelete(false);
    }
  }

  return (
    <article className={`wrong-record-card subject-${record.subject}`}>
      {record.hasImage && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="这道错题的图片"
          onError={() => setImageFailed(true)}
          src={buildProtectedImageUrl(getWrongQuestionImagePath(record.id))}
        />
      ) : <div className="wrong-record-subject" aria-label={`${record.subject}错题`}>{record.subject}</div>}

      <div className="wrong-record-content">
        <div className="wrong-record-meta">
          <span>{record.subject}</span>
          <small>{formatCreatedAt(record.createdAt)}</small>
        </div>
        <h3>{record.questionText}</h3>
        <p>{record.errorReason || "还没有填写错误原因，可以先自己回想，再请求 AI 分析。"}</p>

        {record.knowledgePoints.length > 0 ? (
          <ul className="wrong-knowledge-list" aria-label="知识点">
            {record.knowledgePoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
        ) : null}

        <details
          className="wrong-record-details"
          onToggle={(event) => setIsExpanded(event.currentTarget.open)}
          open={isExpanded}
        >
          <summary>查看题目与分析详情</summary>
          {record.analysisStatus === "completed" && record.analysisSummary ? (
            <section className="wrong-analysis-result" aria-label="AI 分析结果">
              <strong>AI 分析已完成</strong>
              <p>{record.analysisSummary}</p>
            </section>
          ) : (
            <p className="wrong-muted-copy">
              {integrations?.llm.configured
                ? "还没有请求 AI 分析。你可以先写下自己的判断，再请 AI 帮你核对。"
                : "AI 分析尚未配置；你仍可手动补充错因并继续复习。"}
            </p>
          )}

          {isEditing ? (
            <fieldset className="wrong-edit-form" disabled={isSaving}>
              <legend>修改这道错题</legend>
              <label>
                学科
                <select
                  onChange={(event) => setEditor((current) => ({
                    ...current,
                    subject: event.target.value as WrongQuestionSubject,
                  }))}
                  value={editor.subject}
                >
                  {subjects.map((subject) => <option key={subject}>{subject}</option>)}
                </select>
              </label>
              <label>
                题目文字
                <textarea
                  maxLength={4000}
                  onChange={(event) => setEditor((current) => ({ ...current, questionText: event.target.value }))}
                  rows={4}
                  value={editor.questionText}
                />
              </label>
              <label>
                知识点
                <input
                  maxLength={500}
                  onChange={(event) => setEditor((current) => ({ ...current, knowledgePointsText: event.target.value }))}
                  value={editor.knowledgePointsText}
                />
              </label>
              <label>
                我的错误原因
                <input
                  maxLength={500}
                  onChange={(event) => setEditor((current) => ({ ...current, errorReason: event.target.value }))}
                  value={editor.errorReason}
                />
              </label>
              <div className="wrong-inline-actions">
                <button className="wrong-primary-action" onClick={handleSaveEdit} type="button">
                  {isSaving ? "正在保存…" : "保存修改"}
                </button>
                <button
                  onClick={() => {
                    setEditor(createEditorState(record));
                    setEditorError("");
                    setIsEditing(false);
                  }}
                  type="button"
                >
                  取消
                </button>
              </div>
            </fieldset>
          ) : null}

          {editorError ? <p className="form-feedback is-error" role="alert">{editorError}</p> : null}
        </details>

        <div className="wrong-record-actions">
          {showAnalysisAction ? <button disabled={isAnalyzing} onClick={() => void onAnalyze(record.id)} type="button">
            {isAnalyzing ? "正在分析…" : "请求 AI 错因分析"}
          </button> : null}
          <button
            onClick={() => {
              setEditor(createEditorState(record));
              setEditorError("");
              setIsEditing(true);
              setIsExpanded(true);
            }}
            type="button"
          >
            修改
          </button>
          {!isConfirmingDelete ? (
            <button onClick={() => setIsConfirmingDelete(true)} type="button">删除</button>
          ) : (
            <span className="wrong-delete-confirmation" role="group" aria-label="确认删除错题">
              <strong>确定删除？</strong>
              <button className="wrong-danger-action" disabled={isDeleting} onClick={() => void handleDelete()} type="button">
                {isDeleting ? "正在删除…" : "确认删除"}
              </button>
              <button disabled={isDeleting} onClick={() => setIsConfirmingDelete(false)} type="button">取消</button>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
