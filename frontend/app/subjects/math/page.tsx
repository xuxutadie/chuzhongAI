import Link from "next/link";
import { StudentPageShell } from "../../components/student_page_shell";
import { WorkspaceIcon } from "../../components/workspace_icon";

export default function MathSubjectPage() {
  return (
    <StudentPageShell eyebrow="数学学习" title="把不懂的地方，慢慢弄明白" description="按章节复习，用互动理解，随时查阅教材。这里的资源可以自由使用，不需要按顺序解锁。">
      <div className="resource-daily-link"><span>想完成今天安排的任务？</span><Link className="workspace-button secondary" href="/dashboard">继续今日学习 <span aria-hidden="true">→</span></Link></div>
      <section className="math-resource-layout" aria-label="数学学习资源">
        <Link className="resource-feature" href="/subjects/math/review">
          <span className="resource-icon"><WorkspaceIcon name="book" /></span>
          <span className="resource-kicker">按自己的课堂进度</span>
          <h2>章节复习</h2>
          <p>选择正在学的章节，回顾知识点、例题与常见错误。</p>
          <span className="resource-meta">北师大版 · 七年级上册 · 六个章节</span>
          <strong>选择章节 <span aria-hidden="true">→</span></strong>
        </Link>
        <div className="resource-side">
          <Link className="resource-row" href="/interactive-lessons"><span className="resource-icon"><WorkspaceIcon name="cube" /></span><div><h2>互动教学</h2><p>拖一拖、试一试，让抽象的数学看得见。</p><strong>探索互动课件 <span aria-hidden="true">→</span></strong></div></Link>
          <Link className="resource-row" href="/materials"><span className="resource-icon"><WorkspaceIcon name="folder" /></span><div><h2>数学教材</h2><p>打开教材 PDF，对照课堂内容随时查阅。</p><strong>查阅教材 <span aria-hidden="true">→</span></strong></div></Link>
        </div>
      </section>
      <p className="workspace-footnote">每日任务在学习首页按五步完成；这里的自主复习不会替代今日任务，也不会改变当前进度。</p>
    </StudentPageShell>
  );
}
