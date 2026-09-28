import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../app/student-api.ts';

test('单题维护只读取指定错题，并拒绝不完整响应', async () => {
  assert.equal(typeof api.getWrongQuestion, 'function');
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(url);
    return Response.json({ question: { id: 12, subject: '数学', question_text: '求面积', knowledge_points: [], has_image: false } });
  };
  try {
    const question = await api.getWrongQuestion(12);
    assert.equal(question.id, 12);
    assert.equal(question.questionText, '求面积');
    assert.deepEqual(requests, ['/api/student/wrong-questions/12']);
    globalThis.fetch = async () => Response.json({ question: {} });
    await assert.rejects(() => api.getWrongQuestion(12), api.StudentApiError);
  } finally { globalThis.fetch = originalFetch; }
});
