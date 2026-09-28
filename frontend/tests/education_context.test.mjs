import test from 'node:test';
import assert from 'node:assert/strict';
import {configureEducation,selectEducation,captureEducation,assertEducationCurrent,educationHeaders,educationBinaryUrl} from '../app/education/context_model.ts';
import {forwardEducationHeaders,allowedEducationRoute} from '../app/education/route_rules.ts';
import {allowedKnowledgeRoute} from '../app/api/teacher/knowledge/route_rules.js';

const a={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',membership_id:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',space_revision:1,membership_revision:1,name:'甲校',kind:'school',role:'teacher'};
test('学校切换后，迟到结果及切回原学校的旧结果均拒绝',()=>{
  configureEducation(7,true);selectEducation(a);const old=captureEducation();
  selectEducation({...a,id:'cccccccc-cccc-4ccc-cccc-cccccccccccc'});
  assert.throws(()=>assertEducationCurrent(old));
  selectEducation(a);assert.throws(()=>assertEducationCurrent(old));
  assert.doesNotThrow(()=>assertEducationCurrent(captureEducation()));
});
test('账号切换清除旧学校，缺学校不能发资源请求',()=>{
  configureEducation(7,true);selectEducation(a);const old=captureEducation();
  configureEducation(8,true);assert.throws(()=>educationHeaders(true));
  assert.throws(()=>assertEducationCurrent(old));
});
test('附件带完整公开上下文，代理不转发伪造授权与未知头',()=>{
  configureEducation(7,true);selectEducation(a);
  const url=educationBinaryUrl('/api/teacher/knowledge/files/example/download',7);
  const request=new Request('https://test.local'+url,{headers:{'Authorization':'attacker','X-Other':'secret'}});
  const headers=forwardEducationHeaders(request,true);
  assert.equal(headers.get('X-Education-Space-Id'),a.id);
  assert.equal(headers.get('X-Education-Membership-Revision'),'1');
  assert.equal(headers.get('Authorization'),null);
  assert.equal(forwardEducationHeaders(request,false).get('X-Education-Space-Id'),null);
  assert.equal(allowedKnowledgeRoute(['files',a.id,'download'],'GET',new URL(request.url).searchParams),true);
});
test('代理路径严格限制为已定义操作，不能透传任意接口',()=>{
  assert.equal(allowedEducationRoute(['spaces',a.id,'members'],'GET'),true);
  assert.equal(allowedEducationRoute(['students','9','history'],'GET'),true);
  assert.equal(allowedEducationRoute(['students','9'],'DELETE'),false);
  assert.equal(allowedEducationRoute(['..','admin'],'GET'),false);
  assert.equal(allowedEducationRoute(['spaces',a.id,'ai','llm'],'PUT'),true);
});
