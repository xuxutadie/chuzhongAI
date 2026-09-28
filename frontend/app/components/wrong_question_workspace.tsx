"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  analyzeWrongQuestion,
  createWrongQuestion,
  deleteWrongQuestion,
  deleteWrongQuestionUpload,
  getIntegrationStatus,
  listWrongQuestions,
  recognizeWrongQuestionImage,
  StudentApiError,
  type IntegrationStatus,
  type WrongQuestion,
  type WrongQuestionInput,
  updateWrongQuestion,
  uploadWrongQuestionImage,
} from "../student-api";
import { createRequestGeneration } from "../async_generation_guard";
import {
  buildWrongQuestionPayload,
  validateWrongQuestionDraft,
  validateWrongQuestionFile,
  type WrongQuestionSubject,
} from "../wrong-questions/wrong_question_model.js";
import { WrongQuestionRecordCard } from "./wrong_question_record_card";
import { isSubjectEnabled } from "../subject-visibility.js";

const subjects = (["数学", "英语", "语文"] as WrongQuestionSubject[]).filter(isSubjectEnabled);
const WRONG_QUESTION_PAGE_SIZE = 50;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function mergeRecords(current: WrongQuestion[], incoming: WrongQuestion[]) {
  const seen = new Set<number>();
  return [...current, ...incoming].filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

type PendingOcrResult = {
  uploadId: string;
  questionText: string;
  formulas: string[];
  diagramDescription: string | null;
};

/**
 * 学生错题集：图片只在上传前作为 Object URL 预览，记录始终来自当前账号的服务端列表。
 * OCR 是待确认的辅助步骤，任何结果都必须由学生确认题干后才能保存。
 */
export function WrongQuestionWorkspace({ showRecords = true }: { showRecords?: boolean }) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUploadIdRef = useRef<string | null>(null);
  const selectionVersionRef = useRef(0);
  const questionTextVersionRef = useRef(0);
  const listGenerationRef = useRef(createRequestGeneration());
  const [subject, setSubject] = useState<WrongQuestionSubject>("数学");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [knowledgePointsText, setKnowledgePointsText] = useState("");
  const [errorReason, setErrorReason] = useState("");
  const [ocrHints, setOcrHints] = useState<{ formulas: string[]; diagramDescription: string | null } | null>(null);
  const [pendingOcrResult, setPendingOcrResult] = useState<PendingOcrResult | null>(null);
  const [records, setRecords] = useState<WrongQuestion[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [nextRecordOffset, setNextRecordOffset] = useState(0);
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");

  const loadServerData = useCallback(async () => {
    const listGeneration = listGenerationRef.current.advance();
    setIsLoadingRecords(true);
    setIsLoadingMore(false);
    setListError("");
    // 切换账号或手动刷新时，不让旧列表在新的请求期间继续显示。
    setRecords([]);
    setTotalRecords(0);
    setNextRecordOffset(0);
    const [questionsResult, integrationsResult] = await Promise.allSettled([
      listWrongQuestions({ limit: WRONG_QUESTION_PAGE_SIZE, offset: 0 }),
      getIntegrationStatus(),
    ]);
    if (!listGenerationRef.current.isCurrent(listGeneration)) return;

    if (questionsResult.status === "fulfilled") {
      const page = questionsResult.value;
      setRecords(page.questions);
      setTotalRecords(page.total);
      setNextRecordOffset(page.offset + page.questions.length);
    } else {
      setListError(errorMessage(questionsResult.reason, "错题集暂时无法加载，请稍后重试。"));
    }

    if (integrationsResult.status === "fulfilled") {
      setIntegrations(integrationsResult.value);
    }
    setIsLoadingRecords(false);
  }, []);

  async function loadMoreRecords() {
    if (isLoadingMore || isLoadingRecords || nextRecordOffset >= totalRecords) return;
    const listGeneration = listGenerationRef.current.current();
    setIsLoadingMore(true);
    setListError("");
    try {
      const page = await listWrongQuestions({ limit: WRONG_QUESTION_PAGE_SIZE, offset: nextRecordOffset });
      if (!listGenerationRef.current.isCurrent(listGeneration)) return;
      setRecords((current) => mergeRecords(current, page.questions));
      setTotalRecords(page.total);
      setNextRecordOffset(page.questions.length ? page.offset + page.questions.length : page.total);
    } catch (loadError) {
      if (!listGenerationRef.current.isCurrent(listGeneration)) return;
      setListError(errorMessage(loadError, "更多错题暂时无法加载，请稍后重试。"));
    } finally {
      if (listGenerationRef.current.isCurrent(listGeneration)) setIsLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadServerData();
    return () => {
      listGenerationRef.current.advance();
    };
  }, [loadServerData]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    selectionVersionRef.current += 1;
    const stagedUploadId = activeUploadIdRef.current;
    if (stagedUploadId) {
      activeUploadIdRef.current = null;
      void discardStagedUpload(stagedUploadId);
    }
  }, []);

  function setMessage(nextNotice = "", nextError = "") {
    setNotice(nextNotice);
    setError(nextError);
  }

  async function discardStagedUpload(stagedUploadId: string) {
    try {
      await deleteWrongQuestionUpload(stagedUploadId);
    } catch (cleanupError) {
      // 已关联至正式错题的图片会返回 409；此时绝不能误删正式错题图片。
      if (!(cleanupError instanceof StudentApiError && cleanupError.status === 409)) {
        // 清理暂存文件失败不影响学生继续填写或保存；下次打开仍以服务端数据为准。
      }
    }
  }

  function setActiveUploadId(nextUploadId: string | null) {
    activeUploadIdRef.current = nextUploadId;
    setUploadId(nextUploadId);
  }

  function clearSelectedImage(discardStaged = true) {
    // 图片一换，所有正在进行的上传 / OCR 结果都已过期，不能再写回当前草稿。
    selectionVersionRef.current += 1;
    const stagedUploadId = activeUploadIdRef.current;
    activeUploadIdRef.current = null;
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadId(null);
    setOcrHints(null);
    setPendingOcrResult(null);
    setIsUploading(false);
    setIsRecognizing(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (discardStaged && stagedUploadId) void discardStagedUpload(stagedUploadId);
  }

  function resetDraft(discardStaged = true) {
    clearSelectedImage(discardStaged);
    setQuestionText("");
    setKnowledgePointsText("");
    setErrorReason("");
  }

  function handleQuestionTextChange(nextQuestionText: string) {
    // 只要学生亲手改过题干，就不再让尚未返回的 OCR 覆盖这段内容。
    questionTextVersionRef.current += 1;
    setQuestionText(nextQuestionText);
    setPendingOcrResult(null);
  }

  function applyOcrResult(result: PendingOcrResult) {
    questionTextVersionRef.current += 1;
    setQuestionText(result.questionText);
    setOcrHints({ formulas: result.formulas, diagramDescription: result.diagramDescription });
    setPendingOcrResult(null);
  }

  function applyPendingOcrResult() {
    if (!pendingOcrResult || activeUploadIdRef.current !== pendingOcrResult.uploadId) {
      setPendingOcrResult(null);
      setMessage("", "这份识别结果已不对应当前图片，请重新识别。");
      return;
    }
    applyOcrResult(pendingOcrResult);
    setMessage("已应用识别结果。请逐字核对题干、公式和图形说明；确认后再保存。", "");
  }

  function handleImageChange(file?: File) {
    if (!file) return;
    const validation = validateWrongQuestionFile(file);
    if (validation) {
      setMessage("", validation);
      return;
    }

    clearSelectedImage();
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrHints(null);
    setMessage("已选好图片。先上传，再决定是否使用 OCR 识别题干。", "");
  }

  async function handleUpload() {
    if (!selectedFile) {
      setMessage("", "请先拍照或选择一张题目图片。");
      return;
    }
    const validation = validateWrongQuestionFile(selectedFile);
    if (validation) {
      setMessage("", validation);
      return;
    }

    const fileToUpload = selectedFile;
    const selectionVersion = selectionVersionRef.current;
    setIsUploading(true);
    setMessage();
    try {
      const upload = await uploadWrongQuestionImage(fileToUpload);
      // 上传期间若已更换或移除图片，刚返回的暂存图必须清理，不能误关联到新草稿。
      if (selectionVersion !== selectionVersionRef.current) {
        void discardStagedUpload(upload.uploadId);
        return;
      }
      setActiveUploadId(upload.uploadId);
      setMessage("图片已上传到你的受保护错题草稿。现在可以识别题目，也可以手动填写。", "");
    } catch (uploadError) {
      if (selectionVersion === selectionVersionRef.current) {
        setMessage("", errorMessage(uploadError, "图片上传失败，请检查网络后重试。"));
      }
    } finally {
      if (selectionVersion === selectionVersionRef.current) setIsUploading(false);
    }
  }

  async function handleRecognize() {
    if (!uploadId) {
      setMessage("", "请先上传图片，再识别题目。");
      return;
    }

    const recognizingUploadId = uploadId;
    const selectionVersion = selectionVersionRef.current;
    const questionTextVersionAtStart = questionTextVersionRef.current;
    const hadQuestionTextAtStart = questionText.trim().length > 0;
    setIsRecognizing(true);
    setMessage();
    try {
      const result = await recognizeWrongQuestionImage(recognizingUploadId);
      // OCR 只能写回仍然选中的同一张已上传图片，避免晚到响应覆盖手动输入或新图片。
      if (
        selectionVersion !== selectionVersionRef.current
        || activeUploadIdRef.current !== recognizingUploadId
        || result.uploadId !== recognizingUploadId
      ) return;
      const recognized = {
        uploadId: recognizingUploadId,
        questionText: result.questionText,
        formulas: result.formulas,
        diagramDescription: result.diagramDescription,
      } satisfies PendingOcrResult;
      if (questionTextVersionRef.current !== questionTextVersionAtStart || hadQuestionTextAtStart) {
        setPendingOcrResult(recognized);
        setMessage("识别完成，但没有覆盖你正在填写的题干。请查看后自行决定是否应用识别结果。", "");
        return;
      }
      applyOcrResult(recognized);
      setMessage("识别完成。请逐字核对题干、公式和图形说明；确认后再保存。", "");
    } catch (recognizeError) {
      if (selectionVersion !== selectionVersionRef.current || activeUploadIdRef.current !== recognizingUploadId) return;
      const isNotConfigured = recognizeError instanceof StudentApiError && recognizeError.status === 409;
      setMessage(
        "",
        isNotConfigured
          ? "OCR 尚未配置。你仍可手动填写题目文字后保存。"
          : `${errorMessage(recognizeError, "图片识别失败。")} 你仍可手动填写题目文字后保存。`,
      );
    } finally {
      if (selectionVersion === selectionVersionRef.current && activeUploadIdRef.current === recognizingUploadId) {
        setIsRecognizing(false);
      }
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateWrongQuestionDraft({ questionText });
    if (validation) {
      setMessage("", validation);
      return;
    }
    if (selectedFile && !uploadId) {
      setMessage("", "已选择的图片尚未上传。请先上传图片，或移除图片后按手动录入保存。");
      return;
    }

    setIsSaving(true);
    setMessage();
    try {
      const input = buildWrongQuestionPayload({
        subject,
        questionText,
        knowledgePointsText,
        errorReason,
        sourceUploadId: uploadId ?? undefined,
      });
      await createWrongQuestion(input);
      // 上传编号已经被服务端关联到正式错题，不能在 reset 时删除它。
      resetDraft(false);
      // 新建会改变首屏顺序；重新读取首页可避免 offset 与总数在第 50 条边界漂移。
      await loadServerData();
      setMessage(showRecords ? "错题已保存。你可以在下方补充错因，或请求 AI 分析。" : "错题已保存到错题集。可以继续添加，或返回列表查看并分析。", "");
    } catch (saveError) {
      setMessage("", errorMessage(saveError, "错题保存失败，请稍后重试。"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAnalyze(questionId: number) {
    setAnalyzingId(questionId);
    setMessage();
    try {
      const result = await analyzeWrongQuestion(questionId);
      setRecords((current) => current.map((record) => record.id === questionId ? result.question : record));
      setMessage(result.analysis.suggestion || "AI 分析已写入这道错题。", "");
    } catch (analysisError) {
      const isNotConfigured = analysisError instanceof StudentApiError && analysisError.status === 409;
      setMessage(
        "",
        isNotConfigured
          ? "AI 分析尚未配置。你可以先在“我的错误原因”中手动记录思路。"
          : errorMessage(analysisError, "AI 分析暂时不可用，请稍后重试。"),
      );
    } finally {
      setAnalyzingId(null);
    }
  }

  async function handleDelete(questionId: number) {
    setDeletingId(questionId);
    setMessage();
    try {
      await deleteWrongQuestion(questionId);
      // 删除同样会使后续分页整体前移，重新读取首页比手工修补 offset 更可靠。
      await loadServerData();
      setMessage("错题已删除，关联图片也已一并移除。", "");
    } catch (deleteError) {
      setMessage("", errorMessage(deleteError, "删除失败，请稍后重试。"));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUpdate(
    questionId: number,
    input: Omit<WrongQuestionInput, "source_upload_id" | "error_reason"> & { error_reason?: string | null },
  ) {
    const updated = await updateWrongQuestion(questionId, input);
    setRecords((current) => current.map((record) => record.id === questionId ? updated : record));
    setMessage("错题修改已保存。", "");
  }

  const hasSelectedImage = Boolean(selectedFile);

  return (
    <div className="wrong-question-workspace">
      <section className="wrong-upload-panel" aria-labelledby="wrong-upload-title">
        <div className="feature-section-heading">
          <div>
            <span>添加新错题</span>
            <h2 id="wrong-upload-title">拍照上传，也可以手动录入</h2>
            <p>图片先上传，再决定是否识别；识别内容必须由你确认后才会保存。</p>
          </div>
          <ol className="compact-flow" aria-label="添加错题步骤">
            <li className={uploadId ? "is-done" : "is-current"}><b>1</b>上传题目</li>
            <li className={uploadId ? "is-current" : ""}><b>2</b>确认内容</li>
            <li className={questionText.trim() ? "is-current" : ""}><b>3</b>保存错题</li>
          </ol>
        </div>

        <div className="wrong-upload-layout">
          <div className="wrong-image-column">
            <input
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="visually-hidden"
              id="wrong-question-camera"
              onChange={(event) => handleImageChange(event.target.files?.[0])}
              ref={cameraInputRef}
              type="file"
            />
            <input
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              id="wrong-question-file"
              onChange={(event) => handleImageChange(event.target.files?.[0])}
              ref={fileInputRef}
              type="file"
            />

            <div className={`wrong-drop-zone ${previewUrl ? "has-image" : ""}`}>
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="准备上传的错题图片预览" src={previewUrl} />
                  <strong>{selectedFile?.name}</strong>
                  <span>预览仅保存在当前页面，保存后图片由你的账号受保护。</span>
                </>
              ) : (
                <>
                  <strong>选择错题照片</strong>
                  <span>支持 JPG、PNG、WebP，建议只拍一道题</span>
                  <small>单张最多 5MB</small>
                </>
              )}
            </div>

            <div className="wrong-image-actions">
              <button onClick={() => cameraInputRef.current?.click()} type="button">拍照上传</button>
              <button onClick={() => fileInputRef.current?.click()} type="button">从相册或电脑选择</button>
            </div>
            {hasSelectedImage ? (
              <div className="wrong-upload-actions">
                <button className="wrong-primary-action" disabled={isUploading || Boolean(uploadId)} onClick={() => void handleUpload()} type="button">
                  {isUploading ? "正在上传图片…" : uploadId ? "图片已上传" : "上传图片"}
                </button>
                <button disabled={isRecognizing || !uploadId} onClick={() => void handleRecognize()} type="button">
                  {isRecognizing ? "正在识别…" : "识别图片中的题目"}
                </button>
                <button onClick={() => clearSelectedImage()} type="button">移除图片</button>
              </div>
            ) : null}
            {integrations && !integrations.ocr.configured ? (
              <p className="ocr-entry-note">OCR 暂未配置，不影响你手动填写题目并保存。<Link href="/ai-settings">查看我的 AI 设置</Link></p>
            ) : null}
          </div>

          <form className="wrong-form-column" onSubmit={handleSave}>
            <label>
              这道题属于哪一科？
              <select onChange={(event) => setSubject(event.target.value as WrongQuestionSubject)} value={subject}>
                {subjects.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              确认题目文字 <span className="field-required">（必填）</span>
              <textarea
                maxLength={4000}
                onChange={(event) => handleQuestionTextChange(event.target.value)}
                placeholder="请自己输入，或检查 OCR 识别后逐字修改。"
                required
                rows={5}
                value={questionText}
              />
            </label>
            {ocrHints ? (
              <aside className="ocr-confirmation-hints" aria-label="OCR 识别提示">
                <strong>识别提示（请核对，不会自动保存）</strong>
                {ocrHints.formulas.length > 0 ? <p>公式：{ocrHints.formulas.join("；")}</p> : null}
                {ocrHints.diagramDescription ? <p>图形说明：{ocrHints.diagramDescription}</p> : null}
                {!ocrHints.formulas.length && !ocrHints.diagramDescription ? <p>没有额外公式或图形提示。</p> : null}
              </aside>
            ) : null}
            {pendingOcrResult ? (
              <aside className="ocr-confirmation-hints" aria-label="待确认的 OCR 识别结果" role="status">
                <strong>识别结果已经准备好</strong>
                <p>你在识别期间修改了题干，因此系统没有自动覆盖。可以保留当前手动内容，或改用识别结果后再核对。</p>
                <div className="wrong-image-actions">
                  <button onClick={applyPendingOcrResult} type="button">应用识别结果</button>
                  <button onClick={() => setPendingOcrResult(null)} type="button">保留当前手动内容</button>
                </div>
              </aside>
            ) : null}
            <label>
              知识点（可用逗号、顿号或换行分隔）
              <input
                maxLength={500}
                onChange={(event) => setKnowledgePointsText(event.target.value)}
                placeholder="例如：一元一次方程、移项"
                value={knowledgePointsText}
              />
            </label>
            <label>
              我错在哪里？（可稍后补充）
              <input
                maxLength={500}
                onChange={(event) => setErrorReason(event.target.value)}
                placeholder="例如：移项时符号写错了"
                value={errorReason}
              />
            </label>
            <button className="wrong-save-button" disabled={isSaving} type="submit">
              {isSaving ? "正在保存…" : "确认无误，保存到错题集"}
            </button>
          </form>
        </div>

        {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
        {notice ? <p className="form-feedback is-success" role="status">{notice}{!showRecords ? <> <Link className="workspace-button secondary" href="/wrong-questions">返回错题集</Link></> : null}</p> : null}
      </section>

      {showRecords ? <section className="wrong-record-section" aria-labelledby="wrong-record-title">
        <div className="feature-section-heading compact">
          <div>
            <span>我的错题</span>
            <h2 id="wrong-record-title">逐题确认，再针对性复习</h2>
          </div>
          <button className="wrong-refresh-button" disabled={isLoadingRecords} onClick={() => void loadServerData()} type="button">
            {isLoadingRecords ? "正在加载…" : "刷新列表"}
          </button>
        </div>

        {isLoadingRecords ? <p className="wrong-loading-state" role="status">正在加载你的错题…</p> : null}
        {!isLoadingRecords && listError && records.length === 0 ? (
          <div className="wrong-empty-state" role="status">
            <p>暂时无法加载错题。</p>
            <button onClick={() => void loadServerData()} type="button">重新加载</button>
          </div>
        ) : null}
        {!isLoadingRecords && !listError && records.length === 0 ? (
          <div className="wrong-empty-state" role="status">
            <h3>还没有错题</h3>
            <p>拍一张错题，或直接把题目输入上方区域；确认后它才会进入你的错题集。</p>
          </div>
        ) : null}
        {records.length > 0 ? (
          <div className="wrong-record-list">
            {records.map((record) => (
              <WrongQuestionRecordCard
                integrations={integrations}
                isAnalyzing={analyzingId === record.id}
                isDeleting={deletingId === record.id}
                key={record.id}
                onAnalyze={handleAnalyze}
                onDelete={handleDelete}
                onUpdate={handleUpdate}
                record={record}
              />
            ))}
          </div>
        ) : null}
        {records.length > 0 ? <p className="wrong-record-count">已显示 {records.length} / {totalRecords} 道错题</p> : null}
        {records.length < totalRecords && nextRecordOffset < totalRecords ? (
          <button className="wrong-refresh-button" disabled={isLoadingMore} onClick={() => void loadMoreRecords()} type="button">
            {isLoadingMore ? "正在加载更多…" : "加载更多"}
          </button>
        ) : null}
        {listError && records.length > 0 ? (
          <p className="form-feedback is-error" role="alert">
            {listError} <button onClick={() => void loadMoreRecords()} type="button">重试加载更多</button>
          </p>
        ) : null}
      </section> : null}
    </div>
  );
}
