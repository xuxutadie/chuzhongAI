import { StudentPageShell } from "../components/student_page_shell";
import { WrongCollectionList } from "../components/wrong_collection_list";

export default function WrongQuestionsPage() {
  return (
    <StudentPageShell
      eyebrow="错题集"
      title="我的错题集"
      description="系统与上传错题放在一起，按阶段理解、巩固和复习。"
      showPageHero={false}
    >
      <WrongCollectionList />
    </StudentPageShell>
  );
}
