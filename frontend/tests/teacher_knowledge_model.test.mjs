import test from 'node:test';
import assert from 'node:assert/strict';
import {canReviewQuestion,validateGeneration,isCurrentResponse,assertCurrentSession,matchesChapterDraft} from '../app/teacher/knowledge/state_model.js';
test('不完整内容不可审核',()=>{
  assert.equal(canReviewQuestion({}),false);
  assert.equal(canReviewQuestion({prompt:'题',answer:{value:2},explanation:'解析',scope:{chapter_version_ids:['c'],knowledge_point_ids:['p']},needs_figure:true,asset_ids:[]}),false);
});
test('生成限额和缺额不静默补题',()=>{
  assert.ok(validateGeneration({original_count:0,variant_count:0,reference_version_ids:[]}).errors.length);
  assert.ok(validateGeneration({original_count:0,variant_count:51,reference_version_ids:[]}).errors.length);
  assert.ok(validateGeneration({original_count:2,variant_count:0,reference_version_ids:['a']}).errors.length);
  assert.deepEqual(validateGeneration({original_count:0,variant_count:2,reference_version_ids:[],allow_ai_fill:true}).errors,[]);
});
test('账号或请求版本变化后丢弃响应',()=>{
  assert.equal(isCurrentResponse(1,2,1,1),false);
  assert.equal(isCurrentResponse(1,1,1,2),false);
  assert.equal(isCurrentResponse(1,1,2,2),true);
});
test('成功的旧上传响应也必须阻止后续批量上传',async()=>{
  let current={owner:1,epoch:1};const calls=[];
  async function request(id){const start={...current};calls.push(id);await Promise.resolve();if(id===1)current={owner:2,epoch:2};assertCurrentSession(start,current);}
  await assert.rejects(async()=>{for(const id of [1,2])await request(id);},/账号已变化/);
  assert.deepEqual(calls,[1]);
  assert.throws(()=>assertCurrentSession(current,current,true),/取消/);
});
test('章节编辑后不能审核旧草稿，来源的无关空选区不影响比对',()=>{
  const saved={title:'有理数',notes:'笔记',knowledge_point_ids:['a'],prerequisite_ids:[],sources:[{file_id:'f',kind:'page',index:1,region:null}]};
  assert.equal(matchesChapterDraft(saved,{...saved,sources:[{file_id:'f',kind:'page',index:1}]}),true);
  assert.equal(matchesChapterDraft(saved,{...saved,notes:'修改后的笔记'}),false);
});
