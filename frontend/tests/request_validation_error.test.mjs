import assert from 'node:assert/strict';
import test from 'node:test';
import { requestJson, StudentApiError } from '../app/student-api.ts';

// 只替换 HTTP 边界，真实执行请求的错误分类；不访问或写入学生记录。
async function rejectionFor(t, status, detail) {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail }), { status }));
  try { await requestJson('/api/diagnosis/profile', { method: 'PUT' }); }
  catch (error) { return error; }
  assert.fail('失败响应必须抛出错误');
}

test('旧后台拒绝新版学校字段时提示版本不兼容，而非服务不可用', async t => {
  const error = await rejectionFor(t, 422, [
    { type: 'extra_forbidden', loc: ['body', 'fields', 'school_name'], msg: 'Extra inputs are not permitted' },
    { type: 'extra_forbidden', loc: ['body', 'fields', 'class_name'], msg: 'Extra inputs are not permitted' },
  ]);
  assert.ok(error instanceof StudentApiError);
  assert.equal(error.status, 422);
  assert.match(error.message, /版本|更新/);
  assert.doesNotMatch(error.message, /服务暂时不可用/);
});

test('字段校验失败给出中文字段提示且不回显原始值和校验器消息', async t => {
  const error = await rejectionFor(t, 422, [
    { type: 'string_too_long', loc: ['body', 'fields', 'nickname'], msg: 'bad input: PRIVATE_EXAMPLE', input: 'PRIVATE_EXAMPLE' },
  ]);
  assert.match(error.message, /称呼/);
  assert.match(error.message, /检查|修改/);
  assert.doesNotMatch(error.message, /PRIVATE_EXAMPLE|服务暂时不可用/);
});

test('未知校验字段不输出内部路径或输入内容', async t => {
  const error = await rejectionFor(t, 422, [{ loc: ['body', 'private_internal_field'], msg: 'PRIVATE_EXAMPLE' }]);
  assert.match(error.message, /提交|填写/);
  assert.doesNotMatch(error.message, /private_internal_field|PRIVATE_EXAMPLE|服务暂时不可用/);
});

test('明确的业务冲突提示保持原样', async t => {
  const error = await rejectionFor(t, 409, '档案已在其他页面更新，请重新载入后继续。');
  assert.equal(error.message, '档案已在其他页面更新，请重新载入后继续。');
  assert.equal(error.status, 409);
});

test('真实服务故障仍与表单校验错误区分', async t => {
  const error = await rejectionFor(t, 503, null);
  assert.equal(error.status, 503);
  assert.match(error.message, /服务暂时不可用/);
});
