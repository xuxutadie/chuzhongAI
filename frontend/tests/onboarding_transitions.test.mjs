import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../app/diagnosis/model.ts';

// 抓住原故障：旧报告存在时错误发送 retest:false，重复拿回已交卷试卷。
for (const [name, state, expected] of [
  ['已有旧报告', { attempt: { status: 'submitted' }, history: [{ status: 'submitted' }] }, true],
  ['首次测评', { attempt: null, history: [] }, false],
  ['已有未完成测评', { attempt: { status: 'active' }, history: [{ status: 'submitted' }] }, false],
  ['仅历史列表有报告', { attempt: null, history: [{ status: 'submitted' }] }, true],
]) {
  test(`${name}的开始请求正确区分新测评与续答`, async t => {
    assert.equal(typeof model.startDiagnosisAttempt, 'function');
    let request;
    const activeAttempt = { id: 'new-attempt', status: 'active' };
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      request = { url, method: init.method, body: JSON.parse(init.body) };
      return new Response(JSON.stringify(activeAttempt));
    });
    const result = await model.startDiagnosisAttempt(state);
    assert.deepEqual(request, { url: '/api/diagnosis/attempts', method: 'POST', body: { retest: expected } });
    assert.deepEqual(result, activeAttempt);
  });
}

test('文字题切换成绩题时，旧文字与满分都不进入新数字框', () => {
  assert.equal(typeof model.interviewReplyFor, 'function');
  assert.deepEqual(model.interviewReplyFor('exam', { field: 'progress_detail', input: '会做但讲不清', total: '100' }), { input: '', total: '' });
});

test('切换每日分钟数时不会继承其他问题的答案，即使旧值也是数字', () => {
  assert.equal(typeof model.interviewReplyFor, 'function');
  assert.deepEqual(model.interviewReplyFor('daily_minutes', { field: 'exam', input: '90', total: '100' }), { input: '', total: '' });
});

test('保存失败仍停在同一题时保留学生输入，不能把合法小数清掉', () => {
  assert.equal(typeof model.interviewReplyFor, 'function');
  assert.deepEqual(model.interviewReplyFor('exam', { field: 'exam', input: '89.5', total: '100' }), { input: '89.5', total: '100' });
});

test('首次昵称可预填，学生主动清空后不再强行恢复', () => {
  assert.equal(typeof model.interviewReplyFor, 'function');
  assert.deepEqual(model.interviewReplyFor('nickname', null, '小林'), { input: '小林', total: '' });
  assert.deepEqual(model.interviewReplyFor('nickname', { field: 'nickname', input: '', total: '' }, '小林'), { input: '', total: '' });
});
