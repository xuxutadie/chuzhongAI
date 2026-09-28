"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getTeacherIntegrationStatus,
  type IntegrationCapabilityStatus,
  type IntegrationStatus,
} from "../ai-runtime-client";
import { StudentPageShell } from "../components/student_page_shell";
import { useStudentSession } from "../components/student_session_provider";

function capabilityDescription(capability: IntegrationCapabilityStatus, name: string) {
  if (capability.configured) {
    const provider = capability.provider || "已配置服务";
    const model = capability.model ? ` · ${capability.model}` : "";
    return `${name}已可用：${provider}${model}`;
  }
  if (capability.enabled) return `${name}开关已开启，但服务器配置还不完整。`;
  return `${name}尚未启用；学生仍可使用手动学习流程。`;
}

function CapabilityCard({ capability, name }: { capability: IntegrationCapabilityStatus; name: string }) {
  return (
    <article className={`workspace-item-card ${capability.configured ? "is-complete" : ""}`}>
      <div className="workspace-item-content">
        <div className="workspace-item-meta">
          <small>{capability.configured ? "已就绪" : "手动模式可用"}</small>
          <span>{name}</span>
        </div>
        <h3>{capabilityDescription(capability, name)}</h3>
        <p>
          {capability.configured
            ? "密钥仅保存在服务器环境中，学生浏览器不会读取或保存。"
            : "未配置时不会伪造识别或分析结果，页面会明确提示学生手动完成下一步。"}
        </p>
      </div>
    </article>
  );
}

export default function ModelConfigPage() {
  const { status: sessionStatus, user } = useStudentSession();
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function refreshStatus() {
    if (user?.role !== "admin") return;
    setIsLoading(true);
    setError("");
    try {
      setIntegrationStatus(await getTeacherIntegrationStatus());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "暂时无法读取服务器配置状态。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (sessionStatus === "authenticated" && user?.role === "admin") {
      void refreshStatus();
    }
  // 教师切换账号后重新读取一次；按钮会显式触发后续检查。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, user?.id, user?.role]);

  return (
    <StudentPageShell
      allowedRoles={["admin"]}
      eyebrow="教师与家长管理"
      title="AI 服务配置状态"
      description="为保护学生和密钥，浏览器只显示是否可用；真实 API 配置请在服务器环境中填写。"
    >
      <div className="model-config-page">
        <section className="model-config-section" aria-labelledby="runtime-status-title">
          <div className="section-heading">
            <p>当前状态</p>
            <h2 id="runtime-status-title">学生端可用能力</h2>
          </div>
          {isLoading ? <p role="status">正在读取服务器配置状态…</p> : null}
          {error ? <p className="form-feedback is-error" role="alert">{error}</p> : null}
          {integrationStatus ? (
            <div className="workspace-item-grid">
              <CapabilityCard capability={integrationStatus.llm} name="AI 答疑与错因分析" />
              <CapabilityCard capability={integrationStatus.ocr} name="OCR 拍照识题" />
            </div>
          ) : !isLoading && !error ? <p>登录教师账号后会显示服务器配置状态。</p> : null}
          <div className="config-action-row">
            <span>本页面不会收集、显示或保存任何 API Key。</span>
            <button disabled={isLoading} onClick={() => void refreshStatus()} type="button">
              {isLoading ? "正在检查…" : "重新检查状态"}
            </button>
          </div>
        </section>

        <section className="model-config-section" aria-labelledby="server-config-title">
          <div className="section-heading">
            <p>明天填写的位置</p>
            <h2 id="server-config-title">在服务器的 .env 中配置</h2>
          </div>
          <p className="section-description">
            先复制 <code>backend/.env.example</code> 为 <code>backend/.env</code>，再由教师在服务器本机填写真实值并重启后端。不要把密钥粘贴到学生浏览器、截图或聊天记录中。
          </p>
          <div className="model-config-fields two-column-fields" aria-label="需要在服务器环境中填写的变量">
            <label>
              AI 答疑与错因分析
              <textarea
                aria-label="AI 服务环境变量示例"
                defaultValue={"LLM_ENABLED=true\nLLM_PROVIDER=\nLLM_API_BASE_URL=\nLLM_API_KEY=\nLLM_MODEL="}
                readOnly
                rows={5}
              />
            </label>
            <label>
              拍照识题（OpenAI 兼容视觉服务）
              <textarea
                aria-label="OCR 服务环境变量示例"
                defaultValue={"OCR_ENABLED=true\nOCR_PROVIDER=openai_compatible_vision\nOCR_API_BASE_URL=\nOCR_API_KEY=\nOCR_MODEL="}
                readOnly
                rows={5}
              />
            </label>
          </div>
          <p className="ocr-entry-note">
            未填写或服务暂时不可用时，学生仍可以在错题集手动输入题目、错因和知识点；不会被卡在上传步骤。
          </p>
        </section>

        <section className="model-config-section model-config-ocr" aria-labelledby="student-entry-title">
          <div className="section-heading">
            <p>学生入口</p>
            <h2 id="student-entry-title">无需先配置也能继续学习</h2>
          </div>
          <div className="ocr-upload-entry">
            <div>
              <strong>错题上传由学生在“错题集”中完成</strong>
              <span>学生可拍照、从相册或电脑选择图片，也可以直接手动录入；OCR 结果始终需要学生确认。教师账号不进入学生错题集，以免触发权限拦截。</span>
            </div>
            <Link href="/teacher/students">管理学生账号</Link>
          </div>
        </section>

        <div className="model-config-footer">
          <span>配置完成并重启后端后，点击“重新检查状态”确认即可。</span>
          <Link href="/teacher/students">返回学生账号管理</Link>
        </div>
      </div>
    </StudentPageShell>
  );
}
