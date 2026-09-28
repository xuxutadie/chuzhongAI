import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './helpers/render_component.mjs';

test('教师概览不会把无记录显示为零分，自述成绩独立标识', () => {
  const { OverviewCard } = loadComponent(new URL('../app/teacher/components/overview_card.tsx',import.meta.url), {
    '../teacher.module.css': {default:new Proxy({}, {get:(_,k)=>String(k)})},
  });
  const value = {student_id:1,link_id:2,profile:{display_name:'学生',fields:{grade:'七年级',exam_score:80,exam_total:100}}, latest_assessment:null,today:null,last_activity:null};
  const html = renderToStaticMarkup(React.createElement(OverviewCard,{value}));
  assert.match(html,/尚无已提交测评/);
  assert.match(html,/学生自述/);
  assert.match(html,/学校待补充/);
  assert.doesNotMatch(html,/本次得分.*0/);
  assert.match(html,/暂无已记录学习活动/);
});

test('教师错题详情展示完整选项，并把参考答案和历次作答映射为选项文本', () => {
  const { WrongQuestionSnapshot } = loadComponent(new URL('../app/teacher/components/wrong_question_snapshot.tsx',import.meta.url));
  const value = {
    prompt:'篮球近似哪种立体图形？',
    options:[{id:'A',text:'圆柱'},{id:'B',text:'球'},{id:'C',text:'圆锥'}],
    answer:'B', explanation:'篮球表面是曲面。',
  };
  const html = renderToStaticMarkup(React.createElement(WrongQuestionSnapshot,{question:value,events:[
    {id:1,result:'wrong',answer:'A',occurred_at:'2026-09-26T00:00:00Z'},
    {id:2,result:'correct',answer:'B',occurred_at:'2026-09-26T00:01:00Z'},
  ]}));
  assert.match(html, /C[\s·：]*圆锥/);
  assert.match(html, /参考答案：B[\s·：]*球/);
  assert.match(html, /回答：A[\s·：]*圆柱/);
  assert.match(html, /回答：B[\s·：]*球/);
});

test('教师错题显示多选与数值零答案，不把缺失答案伪装成零', () => {
  const { WrongQuestionSnapshot } = loadComponent(new URL('../app/teacher/components/wrong_question_snapshot.tsx',import.meta.url));
  const render = (question) => renderToStaticMarkup(React.createElement(WrongQuestionSnapshot,{question,events:[]}));
  assert.match(render({prompt:'选出正数',options:[{id:'A',text:'1'},{id:'C',text:'3'}],answer:['A','C']}),/参考答案：A · 1、C · 3/);
  assert.match(render({prompt:'结果是？',answer:0}),/参考答案：0/);
  assert.match(render({prompt:'照片题目'}),/尚未核实/);
});
