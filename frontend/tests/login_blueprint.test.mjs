import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/render_component.mjs';

test('登录页介绍保留全部学习入口说明，不把首次测评误写成平台全部功能', () => {
  const { LoginIntroduction } = loadComponent(new URL('../app/login/login_introduction.tsx', import.meta.url), {
    './login-blueprint.module.css': {__esModule: true, default: new Proxy({}, {get: (_, key) => String(key)})},
  });
  const html = renderToStaticMarkup(React.createElement(LoginIntroduction));
  for (const label of ['AI 答疑','互动教学','日常练习','章节复习','错题整理','学习报告']) assert.ok(html.includes(label));
  assert.match(html, /id="login-title"/);
  assert.match(html, /首次使用/);
  assert.match(html, /老师发放的账号/);
  assert.match(html, /自己的 AI 服务/);
  assert.doesNotMatch(html, /<button|<input|<a /, '介绍区域不伪装成可操作的入口');
});

test('蓝图装饰不进入读屏内容，不使用虚构成绩或学习统计', () => {
  const { LoginIntroduction } = loadComponent(new URL('../app/login/login_introduction.tsx', import.meta.url), {
    './login-blueprint.module.css': {__esModule: true, default: new Proxy({}, {get: (_, key) => String(key)})},
  });
  const html = renderToStaticMarkup(React.createElement(LoginIntroduction));
  assert.match(html, /class="blueprintArt" aria-hidden="true"/);
  assert.doesNotMatch(html, /提升\s*\d+%|已有\s*\d+\s*名|正确率/);
});
