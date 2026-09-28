'use client';
import {useEffect,useState} from 'react';
import {requestJson} from '../student-api';
import {getExpectedSessionUserId,getSessionEpoch} from '../session_epoch.js';
import {isCurrentAdminResponse} from './state_model';
export async function adminRequest<T>(path:string,options?:RequestInit):Promise<T>{
  const start={owner:getExpectedSessionUserId(),epoch:getSessionEpoch(),path};
  if(options?.signal?.aborted)throw Error('操作已取消');
  const result=await requestJson<T>('/api/admin/workspace/'+path,options);
  if(options?.signal?.aborted||!isCurrentAdminResponse(start,{owner:getExpectedSessionUserId(),epoch:getSessionEpoch(),path}))throw Error('账号已切换，请重新进入');
  return result;
}
export function useAdminResource<T>(path:string,revision=0){
  const [result,setResult]=useState<{path:string;revision:number;data:T|null;error:string}>({path,revision,data:null,error:''});
  useEffect(()=>{
    const controller=new AbortController();setResult({path,revision,data:null,error:''});
    adminRequest<T>(path,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setResult({path,revision,data,error:''});}).catch(e=>{if(!controller.signal.aborted)setResult({path,revision,data:null,error:e.message});});
    return()=>controller.abort();
  },[path,revision]);
  return result.path===path&&result.revision===revision?result:{data:null,error:''};
}
export function saveAdmin<T>(path:string,body:unknown,method='POST',signal?:AbortSignal){return adminRequest<T>(path,{method,signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
export function adminAsset(path:string,userId:number){return '/api/admin/workspace/'+path+'?expected_user_id='+userId;}
