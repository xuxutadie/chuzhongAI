import assert from 'node:assert/strict';
import test from 'node:test';
import * as navigation from '../app/components/workspace_navigation_model.js';

// 防止进入子页面后导航失去选中状态，或相似路径被错误归类。
for (const [path, activeHref, parentHref] of [
  ['/dashboard', '/dashboard', null],
  ['/today-learning', '/dashboard', '/dashboard'],
  ['/learning-summary', '/dashboard', '/dashboard'],
  ['/subjects/math/review', '/subjects/math', '/subjects/math'],
  ['/interactive-lessons/g7-upper-shapes', '/subjects/math', '/interactive-lessons'],
  ['/materials', '/subjects/math', '/subjects/math'],
  ['/wrong-questions/add', '/wrong-questions', '/wrong-questions'],
  ['/wrong-questions/123', '/wrong-questions', '/wrong-questions'],
  ['/reports', '/reports', null],
  ['/wrong-questions-other', null, null],
]) {
  test(`页面 ${path} 的导航归属与返回入口正确`, () => {
    assert.equal(typeof navigation.getWorkspaceLocation, 'function');
    const location = navigation.getWorkspaceLocation(path);
    assert.equal(location.activeHref, activeHref);
    assert.equal(location.parentHref, parentHref);
  });
}
