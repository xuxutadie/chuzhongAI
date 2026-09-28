import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { workspaceNavigationGroups } from "../app/components/workspace_navigation_model.js";

test("工作台导航覆盖学习总览、学科、工具和 AI 教练", () => {
  const items = workspaceNavigationGroups.flatMap((group) => group.items);

  assert.deepEqual(
    workspaceNavigationGroups.map((group) => group.label),
    ["学习总览", "学科学习", "学习工具", "AI 教练"]
  );
  assert.equal(items.length, 5);
  assert.equal(new Set(items.map((item) => item.href)).size, 5);
  assert.deepEqual(
    items.map((item) => item.href),
    [
      "/dashboard",
      "/subjects/math",
      "/wrong-questions",
      "/reports",
      "/assistant",
    ]
  );
});

test("首页主行动进入当前真实未完成任务，而不是固定跳转数学页", () => {
  const source = fs.readFileSync(
    new URL("../app/components/student_dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /router\.push\(currentTask\.learningHref\)/);
  assert.doesNotMatch(source, /router\.push\("\/today-learning"\)/);
  assert.match(source, /开始：\{currentTask\.title\}/);
});

test("窄屏始终展示首页和今日任务，并保留可横向操作的完整导航", () => {
  const navSource = fs.readFileSync(
    new URL("../app/components/student_nav.tsx", import.meta.url),
    "utf8",
  );
  const styleSource = fs.readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );

  assert.match(navSource, /mobile-nav-shortcuts/);
  assert.match(navSource, /今日任务/);
  assert.match(styleSource, /\.mobile-nav-shortcuts/);
  assert.match(styleSource, /scroll-snap-type:\s*x\s+proximity/);
});

test("页面顶部只显示当前账号的真实成长值，并提示保存失败", () => {
  const shellSource = fs.readFileSync(
    new URL("../app/components/student_page_shell.tsx", import.meta.url),
    "utf8",
  );

  assert.match(shellSource, /useLearningProgress/);
  assert.match(shellSource, /今日已获得 \{progress\.growthEarned\} 成长值/);
  assert.doesNotMatch(shellSource, /workbenchStudent/);
  assert.match(shellSource, /storageWarning/);
});

test("所有导航路径都是唯一的绝对路径", () => {
  const items = workspaceNavigationGroups.flatMap((group) => group.items);

  assert.ok(items.every((item) => item.href.startsWith("/")));
  assert.ok(workspaceNavigationGroups.every((group) => group.label.length > 0 && group.items.length > 0));
});
