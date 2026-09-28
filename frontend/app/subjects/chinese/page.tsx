import { StudentPageShell } from "../../components/student_page_shell";
import { TaskEntryList } from "../../components/task_entry_list";
import { LanguageCurriculumCatalog } from "../../components/language_curriculum_catalog";

export default function ChineseSubjectPage() {
  return (
    <StudentPageShell eyebrow="语文" title="选择正在学的语文单元" description="七年级上下册，围绕单元阅读、语言品味与表达方法学习，完成后保存到自己的学习记录。">
      <LanguageCurriculumCatalog subject="语文" />
      <details className="language-legacy"><summary>查看今日已开始的任务与通用练习</summary>
      <TaskEntryList
        description="进入任务后完成阅读、自测和完整表达，系统才会保存今天的语文完成记录。"
        emptyDescription="当前账号今天没有语文任务。教师安排后会显示在这里。"
        emptyTitle="暂时没有可开始的语文任务"
        section="语文任务"
        subject="语文"
        title="今天的语文学习"
      />
      </details>
    </StudentPageShell>
  );
}
