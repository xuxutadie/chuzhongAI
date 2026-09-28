import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./helpers/render_component.mjs";

// 仅隔离登录外壳；测试页面真实内容与链接，不模拟教材或资源目录。
const shellBoundary = { StudentPageShell: ({ children }) => React.createElement("main", null, children) };

test("数学资源可直接进入，只有一个今日学习入口", () => {
  const { default: Page } = loadComponent(new URL("../app/subjects/math/page.tsx", import.meta.url), {
    "../../components/student_page_shell": shellBoundary,
  });
  const html = renderToStaticMarkup(React.createElement(Page));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ["/dashboard", "/subjects/math/review", "/interactive-lessons", "/materials"]);
});

test("教材直接打开受保护的数学 PDF，不夹带任务或隐藏学科", () => {
  const { MaterialsWorkspace } = loadComponent(new URL("../app/components/materials_workspace.tsx", import.meta.url));
  const html = renderToStaticMarkup(React.createElement(MaterialsWorkspace));
  const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(links, ["/api/materials/math-7-upper", "/api/materials/math-7-lower"]);
  assert.equal((html.match(/target="_blank"/g) ?? []).length, 2);
});

for (const [page, destination] of [["tasks", "/dashboard"], ["practice", "/dashboard"], ["subjects", "/subjects/math"]]) {
  test(`旧入口 ${page} 收拢到统一页面且不启动任务`, () => {
    const { default: Page } = loadComponent(new URL(`../app/${page}/page.tsx`, import.meta.url));
    assert.throws(() => Page(), error => error.digest === `NEXT_REDIRECT;replace;${destination};307;`);
  });
}

test("独立添加页保留拍照与手动输入，不再附带第二份错题列表", () => {
  const { WrongQuestionWorkspace } = loadComponent(new URL("../app/components/wrong_question_workspace.tsx", import.meta.url));
  const html = renderToStaticMarkup(React.createElement(WrongQuestionWorkspace, { showRecords: false }));
  assert.match(html, /capture="environment"/);
  assert.match(html, /id="wrong-question-file"/);
  assert.match(html, /<textarea[^>]+required/);
  assert.match(html, /type="submit"/);
  assert.doesNotMatch(html, /id="wrong-record-title"/);
  const legacy = renderToStaticMarkup(React.createElement(WrongQuestionWorkspace));
  assert.match(legacy, /id="wrong-record-title"/);
});
