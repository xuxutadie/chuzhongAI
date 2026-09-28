import { DailyRouteEntry } from "../components/daily_route_entry";
import { StudentPageShell } from "../components/student_page_shell";

export default async function TodayLearningPage({searchParams}:{searchParams:Promise<{step?:string}>}) {
  const requested=Number((await searchParams).step??1);
  const step=Number.isInteger(requested)&&requested>=1&&requested<=5?requested:1;
  return (
    <StudentPageShell
      eyebrow="今日学习"
      title="按课堂内容完成今天的学习"
      description="选择内容、测试理解、针对学习，再用过关测试确认真正掌握。"
      showPageHero={false}
    >
      <DailyRouteEntry step={step}/>
    </StudentPageShell>
  );
}
