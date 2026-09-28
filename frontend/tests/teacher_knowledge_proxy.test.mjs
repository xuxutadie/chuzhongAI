import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedKnowledgeRoute} from '../app/api/teacher/knowledge/route_rules.js';
test('代理仅开放已定义路径方法',()=>{
  const id='12345678-1234-1234-1234-123456789abc';
  assert.equal(allowedKnowledgeRoute(['textbooks'],'GET',new URLSearchParams('limit=20')),true);
  assert.equal(allowedKnowledgeRoute(['files',id,'download'],'GET',new URLSearchParams('expected_user_id=1')),true);
  for(const [path,method,query] of [[['publish'],'POST',''],[['textbooks'],'DELETE',''],[['..','auth'],'GET',''],[['questions'],'GET','owner_id=2'],[['files',id,'download'],'POST','']]) {
    assert.equal(allowedKnowledgeRoute(path,method,new URLSearchParams(query)),false);
  }
});
