import { StudentPageShell } from "../../components/student_page_shell";
import { TaskEntryList } from "../../components/task_entry_list";
import { LanguageCurriculumCatalog } from "../../components/language_curriculum_catalog";

export default function EnglishSubjectPage() {
  return (
    <StudentPageShell eyebrow="英语" title="选择正在学的英语单元" description="七年级上下册，按单元完成首测、讲解、表达练习与过关，学习记录随账号保存。">
      <LanguageCurriculumCatalog subject="英语" />
      <details className="language-legacy"><summary>查看今日已开始的任务与通用练习</summary>
      <TaskEntryList
        description="进入任务后完成学习、自测和反思，系统才会保存今天的英语完成记录。"
        emptyDescription="当前账号今天没有英语任务。教师安排后会显示在这里。"
        emptyTitle="暂时没有可开始的英语任务"
        section="英语任务"
        subject="英语"
        title="今天的英语学习"
      />
      </details>
    </StudentPageShell>
  );
}
