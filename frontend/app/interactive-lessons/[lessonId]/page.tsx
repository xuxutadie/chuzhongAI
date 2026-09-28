import { notFound } from "next/navigation";

import { InteractiveLessonPlayer } from "../../components/interactive_lesson_player";
import { StudentPageShell } from "../../components/student_page_shell";
import { getInteractiveLesson } from "../lesson-catalog";

export default async function InteractiveLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const lesson = getInteractiveLesson(lessonId);

  if (!lesson || lesson.status !== "可学习") {
    notFound();
  }

  return (
    <StudentPageShell
      eyebrow="互动教学"
      title={lesson.title}
      description="先动手探索，再写下规律。不会的地方可以带着具体问题问 AI 老师。"
      showPageHero={false}
    >
      <InteractiveLessonPlayer lesson={lesson} />
    </StudentPageShell>
  );
}
