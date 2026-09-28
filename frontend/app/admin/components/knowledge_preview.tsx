import type {ReactNode} from 'react';
import {QuestionDiagram} from '../../diagnosis/question_diagram';
import {previewDiagram} from '../diagram_preview';
export type KnowledgeItem={id:string;data:Record<string,unknown>;current_version?:KnowledgeItem;questions?:KnowledgeItem[]};
const labels:Record<string,string>={title:'标题',grade:'年级',edition:'教材版本',semester:'学期',subject:'学科',status:'审核状态',prompt:'题目',response_type:'题型',options:'选项',answer:'答案',explanation:'解析',rubric:'评分要点',scope:'知识范围',difficulty:'难度',purpose:'用途',knowledge_point_ids:'知识点',prerequisite_ids:'前置知识',summary:'简介',text:'原文',needs_figure:'需要配图',id:'编号',value:'内容',unit:'单位',choice:'选项',textbook:'教材'};
const words:Record<string,string>={draft:'草稿',reviewed:'已审核',regular:'常规',advanced:'进阶',challenge:'挑战',practice:'练习',test:'测试',single:'单选',multiple:'多选',short:'简答',math:'数学',true:'是',false:'否'};
function display(value:unknown):ReactNode{
  if(value==null)return '未填写';
  if(Array.isArray(value))return value.length?<ul>{value.map((v,i)=><li key={i}>{display(v)}</li>)}</ul>:'无';
  if(typeof value==='object')return <dl className="admin-details">{Object.entries(value as Record<string,unknown>).filter(([k])=>!['current_version_id','question_version_ids','chapter_version_ids'].includes(k)).map(([k,v])=><div key={k}><dt>{labels[k]||k}</dt><dd>{display(v)}</dd></div>)}</dl>;
  return words[String(value)]||String(value);
}
export function KnowledgePreview({item}:{item:KnowledgeItem}){
  const data=item.current_version?.data||item.data;
  const diagram=previewDiagram(data.diagram);
  return <article className="admin-evidence"><dl className="admin-details">{Object.entries(data).filter(([key])=>labels[key]).map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{display(value)}</dd></div>)}</dl>{diagram?<QuestionDiagram diagram={diagram}/>:Boolean(data.diagram||data.needs_figure)&&<p>此题需要配图，但当前只读预览暂不能显示该图；请在教师知识库中核对原始资料。</p>}{item.questions?.map((question,i)=><section key={question.id}><h3>第 {i+1} 题</h3><KnowledgePreview item={question}/></section>)}</article>;
}
