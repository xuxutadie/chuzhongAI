import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCards } from '../app/learning-route/model.js';

test('初次进入始终显示五步，只允许第一步开始',()=>{
  const cards=routeCards({current_step:1,steps:[],started:false});
  assert.equal(cards.length,5);
  assert.deepEqual(cards.map(x=>x.title),['课堂诊断','针对学习','过关测试','错题巩固','今日总结']);
  assert.equal(cards[0].disabled,false);
  assert.ok(cards.slice(1).every(x=>x.disabled));
});
test('已完成只回看，当前继续，后续锁定',()=>{
  const cards=routeCards({current_step:3,started:true,steps:[{status:'completed'},{status:'completed'},{status:'in_progress'},{status:'locked'},{status:'locked'}]});
  assert.equal(cards[0].action,'回看');
  assert.equal(cards[2].action,'继续');
  assert.equal(cards[3].disabled,true);
});
test('加载失败时不能提供一个能越过服务器的开始按钮',()=>{
  assert.ok(routeCards(null).every(x=>x.disabled));
});
