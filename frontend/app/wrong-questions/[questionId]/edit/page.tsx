import { notFound } from "next/navigation";
import { StudentPageShell } from "../../../components/student_page_shell";
import { WrongQuestionMaintenance } from "../../../components/wrong_question_maintenance";

export default async function EditWrongQuestionPage({ params }: { params: Promise<{ questionId: string }> }) {
  const id = Number((await params).questionId);
  if (!Number.isSafeInteger(id) || id < 1) notFound();
  return <StudentPageShell eyebrow="错题集" title="维护这道错题" description="修改题目内容与错因，或删除不再需要保留的记录。">
    <WrongQuestionMaintenance questionId={id} />
  </StudentPageShell>;
}
