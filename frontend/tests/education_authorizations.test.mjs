import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadComponent} from './helpers/render_component.mjs';

function render(items){
  const {Authorizations}=loadComponent(new URL('../app/education/authorizations.tsx',import.meta.url),{
    './hooks':{useEducationResource:()=>({data:{items},error:''})},
    './api':{},
    '../teacher/knowledge/api':{useAction:()=>({busy:false,error:'',message:'',run(){}})},
    '../components/student_session_provider':{useStudentSession:()=>({user:{id:4}})},
    '../teacher/teacher.module.css':{},
  });
  return renderToStaticMarkup(React.createElement(Authorizations));
}

test('授权页按真实接口 items 展示已有授权并提供撤销操作',()=>{
  const html=render([{id:'grant-one',teacher_name:'测试教师甲',space_name:'甲校',state:'active',revision:1}]);
  assert.match(html,/测试教师甲/);
  assert.match(html,/撤销授权/);
  assert.doesNotMatch(html,/还没有教师获得/);
});
test('空列表与已撤销记录明确区分，不给已撤销记录再次撤销按钮',()=>{
  assert.match(render([]),/还没有教师获得/);
  const html=render([{id:'grant-one',teacher_name:'测试教师甲',space_name:'甲校',state:'revoked',revision:2}]);
  assert.match(html,/已撤销/); assert.doesNotMatch(html,/>撤销授权</);
});

test('未完成首次访谈的学生也能进入授权管理，但不能跳过学习首页引导',()=>{
  for(const path of ['/authorizations','/dashboard']){
    const {DiagnosisGate}=loadComponent(new URL('../app/components/diagnosis_gate.tsx',import.meta.url),{
      'next/navigation':{usePathname:()=>path,useRouter:()=>({replace(){}})},
      './student_session_provider':{useStudentSession:()=>({user:{id:4,role:'student'},status:'authenticated'})},
      '../diagnosis/model':{},
    });
    const html=renderToStaticMarkup(React.createElement(DiagnosisGate,null,'我的授权管理'));
    if(path==='/authorizations')assert.equal(html,'我的授权管理');
    else assert.match(html,/正在读取学习档案/);
  }
});

for(const [name,file,component,preview,values] of [
  ['学情授权','authorizations','Authorizations',{teacher_name:'旧教师甲',space_name:'旧甲校',notice:'只读',confirmed_token:'invitation-A'},['invitation-B',null,true,0]],
  ['学校邀请','membership','MemberAcceptance',{school_name:'旧甲校',issuer_name:'旧管理员',role:'teacher',expires_at:'2026-01-01',confirmed_token:'invitation-A'},['invitation-B',null,true]],
])test(`${name}不能展示其他邀请码的迟到预览并用于确认`,()=>{
  let position=0; values[1]=preview;
  const loaded=loadComponent(new URL(`../app/education/${file}.tsx`,import.meta.url),{
    react:{...React,useState:()=>[values[position++],()=>{}]},
    './hooks':{useEducationResource:()=>({data:{items:[]},error:''})}, './api':{},
    '../teacher/knowledge/api':{useAction:()=>({busy:false,error:'',message:'',run(){}})},
    '../components/student_session_provider':{useStudentSession:()=>({user:{id:4}})},
    '../teacher/teacher.module.css':{},
  });
  const html=renderToStaticMarkup(React.createElement(loaded[component]));
  assert.doesNotMatch(html,/旧甲校|旧教师甲|旧管理员/);
  assert.doesNotMatch(html,/>确认授权<|>接受学校邀请<\/button>/);
});
