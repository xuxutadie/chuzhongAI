import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/render_component.mjs';

function render(route, extra = {}) {
  const { LearningRouteMap } = loadComponent(new URL('../app/components/learning_route_map.tsx', import.meta.url), {
    './learning_route_map.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
  });
  return renderToStaticMarkup(React.createElement(LearningRouteMap, { route, busy: false, error: false, onOpen() {}, ...extra }));
}
const route = { date: '2026-09-26', revision: 1, started: true, current_step: 2, course: null,
  steps: ['completed', 'in_progress', 'locked', 'locked', 'locked'].map((status, index) => ({step: index + 1, status})) };

test('路线保留五站，只允许回看已完成站和继续当前站', () => {
  const html = render(route);
  assert.equal((html.match(/<li /g) || []).length, 5);
  assert.equal((html.match(/ disabled=""/g) || []).length, 3);
  assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
  assert.match(html, /回看：课堂诊断/);
  assert.match(html, /继续：针对学习/);
  assert.match(html, /你在这里/);
});
test('未获得服务端进度时，路线不假装已经解锁', () => {
  const html = render(null);
  assert.equal((html.match(/ disabled=""/g) || []).length, 5);
  assert.doesNotMatch(html, /aria-current="step"|你在这里/);
  assert.match(html, /正在恢复进度/);
  assert.match(render(null, {error: true}), /暂时无法读取/);
});
test('无需订正算作已通过，完成后不再标记当前站', () => {
  const html = render({...route, current_step: null, steps: route.steps.map((step, index) => ({...step, status: index === 3 ? 'not_required' : 'completed'}))});
  assert.match(html, /5 \/ 5/);
  assert.match(html, /无需订正/);
  assert.doesNotMatch(html, / disabled=""|aria-current="step"|你在这里/);
});
test('请求进行中，所有入口暂时禁用以避免重复操作', () => {
  assert.equal((render(route, {busy: true}).match(/ disabled=""/g) || []).length, 5);
});
