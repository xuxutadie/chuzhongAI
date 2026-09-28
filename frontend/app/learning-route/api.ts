import { requestJson } from '../student-api';
export function learningGet<T>(path:string){return requestJson<T>(`/api/student/learning${path}`);}
export function learningPost<T>(path:string,payload:Record<string,unknown>={}){
  return requestJson<T>(`/api/student/learning${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
}
export const actionId=()=>crypto.randomUUID();
