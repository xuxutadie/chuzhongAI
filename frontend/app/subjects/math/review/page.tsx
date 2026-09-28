import { StudentPageShell } from "../../../components/student_page_shell";
import { MathCurriculumReview } from "../../../components/math_curriculum_review";

export default function MathReviewPage() {
  return <StudentPageShell eyebrow="数学 · 章节复习" title="跟上自己的课堂进度"
    description="七年级上册六章均可随时复习，不受今日诊断是否已经开始的限制。">
    <MathCurriculumReview />
  </StudentPageShell>;
}
