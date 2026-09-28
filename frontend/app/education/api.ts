import {requestJson} from '../student-api.ts';
import {captureEducation,assertEducationCurrent,educationHeaders} from './context_model.ts';
export async function educationRequest<T>(path:string,options:RequestInit={},scoped=false){
  const captured=captureEducation(),headers=new Headers(options.headers);
  if(scoped)for(const [key,value] of educationHeaders(true))headers.set(key,value);
  const result=await requestJson<T>('/api/education/'+path,{...options,headers});
  assertEducationCurrent(captured);
  return result;
}
export function educationSave<T>(path:string,body:object,scoped=false,method='POST'){
  return educationRequest<T>(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),...body})},scoped);
}
