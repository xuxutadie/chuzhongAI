export const workspaceNavigationGroups = [
  {
    label: "学习总览",
    items: [
      { href: "/dashboard", label: "学习首页", shortLabel: "首页" },
    ]
  },
  {
    label: "学科学习",
    items: [
      { href: "/subjects/math", label: "数学学习", shortLabel: "数学", tone: "blue" }
    ]
  },
  {
    label: "学习工具",
    items: [
      { href: "/wrong-questions", label: "错题集", shortLabel: "错题" },
      { href: "/reports", label: "诊断报告", shortLabel: "报告" }
    ]
  },
  {
    label: "AI 教练",
    items: [
      { href: "/assistant", label: "AI 教练", shortLabel: "AI 问答" }
    ]
  }
];

/** 只匹配完整路径段，子页面也能找到所属栏目及返回位置。 */
export function getWorkspaceLocation(pathname) {
  const within = (root) => pathname === root || pathname.startsWith(`${root}/`);
  const result = (activeHref, label, parentHref = null, parentLabel = null) => ({ activeHref, label, parentHref, parentLabel });
  if (within('/admin/accounts') || within('/admin/view')) return result('/admin/accounts', '账号管理');
  if (within('/admin/events')) return result('/admin/events', '操作记录');
  if (within('/admin')) return result('/admin', '管理员工作台');
  if (within('/teacher/knowledge')) return result('/teacher/knowledge', '知识库');
  if (pathname === '/today-learning' || pathname === '/learning-summary' || within('/tasks') || pathname === '/practice') return result('/dashboard', pathname === '/learning-summary' ? '今日总结' : '今日学习', '/dashboard', '学习首页');
  if (within('/interactive-lessons')) return result('/subjects/math', '互动教学', pathname === '/interactive-lessons' ? '/subjects/math' : '/interactive-lessons', pathname === '/interactive-lessons' ? '数学学习' : '互动教学');
  if (pathname === '/materials') return result('/subjects/math', '数学教材', '/subjects/math', '数学学习');
  if (within('/subjects/math') && pathname !== '/subjects/math') return result('/subjects/math', '章节复习', '/subjects/math', '数学学习');
  if (within('/wrong-questions') && pathname !== '/wrong-questions') return result('/wrong-questions', pathname.endsWith('/add') ? '添加错题' : pathname.endsWith('/review') ? '错题复习' : '错题详情', '/wrong-questions', '错题集');
  if (pathname === '/profile' || pathname === '/ai-settings') return result(null, pathname === '/profile' ? '学习档案' : 'AI 设置', '/dashboard', '学习首页');
  const item = workspaceNavigationGroups.flatMap(group => group.items).find(item => item.href === pathname);
  return result(item?.href ?? null, item?.label ?? '我的学习空间');
}
