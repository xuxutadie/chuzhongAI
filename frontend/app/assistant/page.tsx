"use client";

import { useState } from "react";
import Link from "next/link";

import { askStudentAssistant } from "../ai-runtime-client";
import { AiAssistantPanel } from "../components/ai_assistant_panel";
import { StudentPageShell } from "../components/student_page_shell";
import { useStudentSession } from "../components/student_session_provider";

export default function AssistantPage() {
  const { user } = useStudentSession();
  const [question, setQuestion] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [isAsking, setIsAsking] = useState(false);

  async function handleAskAssistant() {
    if (!question.trim()) {
      setAssistantError("请先输入你的问题。");
      return;
    }

    setIsAsking(true);
    setAssistantError("");
    setAssistantReply("");

    try {
      const response = await askStudentAssistant(question.trim());
      setAssistantReply(response.reply || "AI 老师没有返回内容，请重试。");
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "AI 老师暂时无法回答，请稍后重试。");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <StudentPageShell
      eyebrow="AI 教练"
      title="卡住了？我们一起想一想"
      description="写下题目和你已经尝试的步骤，让 AI 帮你理清思路。"
    >
      <AiAssistantPanel
        question={question}
        reply={assistantReply}
        error={assistantError}
        isAsking={isAsking}
        onQuestionChange={setQuestion}
        onAsk={handleAskAssistant}
      />
      <details className="workspace-help"><summary>AI 服务说明与设置</summary><p>
        {user?.ai_access_mode === "personal" ? "本账号使用你自己的 AI API。尚未配置时，请先到“我的 AI 设置”填写；调用费用由你的服务商账号承担。" : "本账号使用老师统一提供的 AI 服务，无需填写个人 API；服务尚未配置时请联系老师。"}
        {" "}<Link href="/ai-settings">查看我的 AI 设置</Link>
      </p></details>
    </StudentPageShell>
  );
}
