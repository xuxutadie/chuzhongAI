import { StudentPageShell } from '../components/student_page_shell';
import { LearningSummary } from '../components/learning_summary';
export default function SummaryPage(){return <StudentPageShell eyebrow="第五步" title="今日总结" description="真实记录今天的完成情况。" showPageHero={false}><LearningSummary/></StudentPageShell>}
