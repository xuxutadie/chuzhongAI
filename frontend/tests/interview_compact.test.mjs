import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldOpenSavedReport } from '../app/diagnosis/model.ts';

test('重新建档时，即使有历史报告也必须先显示机器人访谈', () => {
  assert.equal(shouldOpenSavedReport({ profile: { confirmed: false }, attempt: { status: 'submitted' } }), false);
  assert.equal(shouldOpenSavedReport({ profile: { confirmed: true }, attempt: { status: 'submitted' } }), true);
  assert.equal(shouldOpenSavedReport({ profile: { confirmed: true }, attempt: null }), false);
});

test('快捷回答挂在机器人问题下面，不放在底部输入栏', () => {
  const view = fs.readFileSync(new URL('../app/diagnosis/interview_view.tsx', import.meta.url), 'utf8');
  const chat = fs.readFileSync(new URL('../app/diagnosis/interview_chat.tsx', import.meta.url), 'utf8');
  const form = view.slice(view.indexOf('<form'), view.indexOf('</form>'));
  assert.doesNotMatch(form, /current\.options|styles\.choices|资料如何使用/);
  assert.match(chat, /\{questionActions\}/);
  assert.ok(chat.indexOf('{questionActions}', chat.indexOf('function ActiveQuestion')) > chat.indexOf('data-typing'));
});
