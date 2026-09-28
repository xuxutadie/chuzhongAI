import { DailyLearningSteps } from "../components/daily_learning_steps";
import { StudentPageShell } from "../components/student_page_shell";
import { SchoolProfileNotice } from "../components/school_profile_notice";

export default function DashboardPage() {
  return (
    <StudentPageShell
      eyebrow="我的学习星球"
      title="学习首页"
      description="查看今天的学习状态、成长等级和近期学习趋势。"
      showPageHero={false}
    >
      <SchoolProfileNotice />
      <DailyLearningSteps />
    </StudentPageShell>
  );
}
