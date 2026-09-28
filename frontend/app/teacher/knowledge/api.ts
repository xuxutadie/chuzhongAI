import {useCallback,useEffect,useRef,useState} from 'react';
import {requestJson} from '../../student-api';
import {getExpectedSessionUserId,getSessionEpoch} from '../../session_epoch.js';
import {assertCurrentSession} from './state_model';
import type {Scope,Chapter,Item,Question,Page} from './types';
import {captureEducation,assertEducationCurrent,educationHeaders} from '../../education/context_model';
export async function knowledgeRequest<T>(path:string,options?:RequestInit) {
  const epoch=getSessionEpoch(),owner=getExpectedSessionUserId();
  const school=captureEducation(),headers=new Headers(options?.headers);
  for(const [key,value] of educationHeaders(true))headers.set(key,value);
  if(options?.signal?.aborted)throw new Error('操作已取消');
  const result=await requestJson<T>('/api/teacher/knowledge/'+path,{...options,headers});
  assertEducationCurrent(school);
  // 成功的旧响应也必须丢弃，避免批量上传下一份文件时误用新账号。
  assertCurrentSession({epoch,owner},{epoch:getSessionEpoch(),owner:getExpectedSessionUserId()},options?.signal?.aborted);
  return result;
}
export function save<T>(path:string,body:unknown,method='POST'){return knowledgeRequest<T>(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
export const blankScope:Scope={grade:'',edition:'',semester:'',chapter_version_ids:[],knowledge_point_ids:[],prerequisite_ids:[]};
export const blankQuestion:Question={prompt:'',response_type:'short',options:[],answer:{},explanation:'',rubric:[],asset_ids:[],needs_figure:false,scope:blankScope,difficulty:'regular',sources:[]};
export function chapterScope(chapter:Item<Chapter>):Scope {const d=chapter.data;return {grade:d.grade,edition:d.edition,semester:d.semester,chapter_version_ids:[chapter.id],knowledge_point_ids:d.knowledge_point_ids,prerequisite_ids:d.prerequisite_ids};}
export function useResource<T>(path:string,revision=0){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setData(null);setError('');
    knowledgeRequest<T>(path,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[path,revision]);return {data,error};
}
export function useCollection<T>(path:string,revision=0){
  const [data,setData]=useState<Page<T>|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setError('');setData(null);
    void (async()=>{const items:T[]=[];let offset=0,total=0;
      do {const url=new URL(path,'http://local/');url.searchParams.set('limit','100');url.searchParams.set('offset',String(offset));
        const page=await knowledgeRequest<Page<T>>(url.pathname.slice(1)+'?'+url.searchParams,{signal:controller.signal});items.push(...page.items);total=page.total;offset+=page.items.length;if(!page.items.length)break;
      }while(offset<total&&!controller.signal.aborted);
      if(!controller.signal.aborted)setData({items,total,limit:items.length,offset:0});
    })().catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[path,revision]);return {data,error};
}
export function useAction(onSuccess?:()=>void){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const mounted=useRef(true),pending=useRef(false),controller=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  const run=useCallback(async (action:(signal:AbortSignal)=>Promise<unknown>,success='已保存')=>{
    if(pending.current)return;pending.current=true;setBusy(true);setError('');setMessage('');
    controller.current=new AbortController();
    try {await action(controller.current.signal);if(mounted.current){setMessage(success);onSuccess?.();}}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'操作失败，请重试');}
    finally{pending.current=false;if(mounted.current)setBusy(false);}
  },[onSuccess]);return {busy,error,message,run};
}
