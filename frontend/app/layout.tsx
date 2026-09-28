import type { Metadata } from "next";
import "./globals.css";
import "./learning-theme.css";
import "./workspace-refinement.css";
import "./blueprint-theme.css";

import { LearningProgressProvider } from "./components/learning_progress_provider";
import { StudentSessionProvider } from "./components/student_session_provider";
import { DiagnosisGate } from "./components/diagnosis_gate";

export const metadata: Metadata = {
  title: "AI初中学习教练系统",
  description: "面向初中学生的 AI 助学教练系统基础工程"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        <StudentSessionProvider>
          <LearningProgressProvider><DiagnosisGate>{children}</DiagnosisGate></LearningProgressProvider>
        </StudentSessionProvider>
      </body>
    </html>
  );
}
