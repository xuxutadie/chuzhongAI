import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypingTimeline, typingFrame } from '../app/diagnosis/typewriter_model.ts';

test('问题逐字出现，完成后显示全文并停止输入状态', () => {
  const timeline = createTypingTimeline('你好');
  assert.deepEqual(typingFrame(timeline, 0), { text: '', typing: true });
  assert.deepEqual(typingFrame(timeline, 40), { text: '你', typing: true });
  assert.deepEqual(typingFrame(timeline, timeline.duration), { text: '你好', typing: false });
});

test('中文标点后有自然停顿，长问题最多六秒显示完', () => {
  const timeline = createTypingTimeline('你好，几年级？');
  assert.equal(typingFrame(timeline, 180).text, '你好，');
  assert.ok(timeline.times[3] - timeline.times[2] > 40);
  assert.ok(createTypingTimeline('很长的问题。'.repeat(100)).duration <= 6000);
});

test('立即显示和减少动画模式直接返回全文，空文本不启动动画', () => {
  assert.deepEqual(typingFrame(createTypingTimeline('完整问题'), 0, true), { text: '完整问题', typing: false });
  assert.deepEqual(typingFrame(createTypingTimeline(''), 0), { text: '', typing: false });
});

test('不会截断表情、组合字符或换行，也不会把文本当成 HTML', () => {
  const timeline = createTypingTimeline('👩‍🏫e\u0301\n<题目>');
  assert.equal(typingFrame(timeline, 40).text, '👩‍🏫');
  assert.equal(typingFrame(timeline, 80).text, '👩‍🏫e\u0301');
  assert.equal(typingFrame(timeline, timeline.duration).text, '👩‍🏫e\u0301\n<题目>');
});
