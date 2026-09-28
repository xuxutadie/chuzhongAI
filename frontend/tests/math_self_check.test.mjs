import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/render_component.mjs';

const modelUrl = new URL('../app/components/self_check_attempt.ts', import.meta.url);
test('自查提交合并双击，失败后沿用原答案与请求标识重试', async () => {
  const { createSelfCheckAttempt } = loadComponent(modelUrl);
  const calls = [];
  let reject;
  const receipt = {result:'wrong',collection_id:12,answer:'a',explanation:'球体',event_id:1};
  const attempt = createSelfCheckAttempt('kp','q', async payload => {
    calls.push(payload);
    if(calls.length === 1) return new Promise((_, fail) => {reject=fail;});
    return receipt;
  }, () => 'request-1');
  const first = attempt.submit('b');
  const second = attempt.submit('c');
  assert.equal(first, second);
  assert.equal(calls.length, 1);
  reject(new Error('网络中断'));
  await assert.rejects(first, /网络中断/);
  assert.equal(await attempt.submit('c'), receipt);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].answer,'b');
  assert.equal(calls[1].request_id,'request-1');
  assert.equal(await attempt.submit('d'), receipt);
  assert.equal(calls.length, 2);
});

test('单选、判断、多选显示真正的选择控件，提交前不泄露解析', () => {
  const { MathSelfCheckQuestion } = loadComponent(new URL('../app/components/math_self_check_question.tsx',import.meta.url), {
    './self_check.module.css': {default:new Proxy({}, {get:(_,key)=>String(key)})},
  });
  for(const type of ['single-choice','true-false','multi-choice']) {
    const html = renderToStaticMarkup(React.createElement(MathSelfCheckQuestion,{
      index:0,knowledgePointId:'kp',question:{id:'q',prompt:'测试题',responseType:type,
        options:[{id:'a',text:'球'},{id:'b',text:'圆柱'}],correctAnswer:'a',explanation:'隐藏的解析'},
    }));
    assert.equal((html.match(new RegExp(`type="${type==='multi-choice'?'checkbox':'radio'}"`,'g'))||[]).length,2);
    assert.match(html,/提交检查/);
    assert.match(html,/<button[^>]*disabled/);
    assert.doesNotMatch(html,/隐藏的解析|正确答案：/);
  }
});
