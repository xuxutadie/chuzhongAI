import { notFound } from "next/navigation";

import { GuidedTaskSession } from "../../components/guided_task_session";
import { StudentPageShell } from "../../components/student_page_shell";
import { getTaskActivity } from "../../task-activity-data";

export default async function GuidedTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const activity = getTaskActivity(taskId);

  if (!activity) {
    notFound();
  }

  return (
    <StudentPageShell
      eyebrow="今日学习"
      title={activity.title}
      description="跟着三个步骤完成，不会的地方可以先看提示。"
      showPageHero={false}
    >
      <GuidedTaskSession activity={activity} />
    </StudentPageShell>
  );
}

