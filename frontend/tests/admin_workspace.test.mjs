import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedAdminRoute} from '../app/api/admin/workspace/route_rules.js';
import {accountActions,isCurrentAdminResponse} from '../app/admin/state_model.js';
import {getRoleHomePath,getRoleDestination} from '../app/student-session-model.ts';
import {previewDiagram} from '../app/admin/diagram_preview.js';

test('题库配图只渲染结构完整的几何图，损坏数据明确回退',()=>{
  const diagram={width:320,height:200,alt:'圆',elements:[{kind:'circle',cx:80,cy:80,r:40}]};
  assert.equal(previewDiagram(diagram),diagram);
  assert.equal(previewDiagram({...diagram,elements:[{kind:'polygon'}]}),null);
  assert.equal(previewDiagram({...diagram,width:0}),null);
  assert.equal(previewDiagram('invalid'),null);
});

test('管理员入口与其他角色隔离',()=>{
  assert.equal(getRoleHomePath('admin'),'/admin');
  assert.equal(getRoleDestination('student','/admin/accounts'),'/dashboard');
  assert.equal(getRoleDestination('teacher','/admin'),'/teacher/students');
  assert.equal(getRoleDestination('student','/%61dmin/accounts'),'/dashboard');
  assert.equal(getRoleDestination('admin','/teacher/knowledge'),'/teacher/knowledge');
});
test('只读查看代理拒绝写方法及额外路径',()=>{
  const allowed=(p,m='GET',q='')=>allowedAdminRoute(p.split('/'),m,new URLSearchParams(q));
  assert.equal(allowed('accounts','POST'),true);
  assert.equal(allowed('views/students/2/history','GET','kind=reports&offset=0'),true);
  assert.equal(allowed('views/students/2','POST'),false);
  assert.equal(allowed('accounts/2/../../model-config','PUT'),false);
  assert.equal(allowed('views/teachers/2/knowledge/files'),false);
  assert.equal(allowed('accounts','GET','role=student&secret=x'),false);
});
test('自身账号危险操作不可用且恢复与启用分开',()=>{
  assert.deepEqual(accountActions({id:1,state:'active'},1),['edit','reset-password']);
  assert.deepEqual(accountActions({id:2,state:'deleted'},1),['restore']);
  assert.ok(accountActions({id:2,state:'disabled'},1).includes('enable'));
});
test('换账号或换对象后丢弃旧响应',()=>{
  const a={owner:1,epoch:1,path:'views/students/2'};
  assert.equal(isCurrentAdminResponse(a,{...a,path:'views/students/3'}),false);
  assert.equal(isCurrentAdminResponse(a,{...a,epoch:2}),false);
  assert.equal(isCurrentAdminResponse(a,{...a,owner:2}),false);
  assert.equal(isCurrentAdminResponse(a,a),true);
});
