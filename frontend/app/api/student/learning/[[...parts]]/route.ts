import { NextResponse } from 'next/server';
import { relayAuthenticatedRequest } from '../../../_backend';

const allowed={
  GET:[/^route$/, /^route\/steps\/[1-5]$/, /^collection$/, /^collection\/\d+$/, /^jobs\/[a-zA-Z0-9-]+$/, /^review$/, /^summary$/],
  POST:[/^route\/start$/, /^route\/steps\/[1-5]\/(start|complete)$/, /^route\/retry-test$/, /^answers$/, /^self-check\/answers$/,
    /^collection\/backfill$/, /^collection\/\d+\/jobs$/, /^collection\/\d+\/practice\/next$/,
    /^practice\/[a-zA-Z0-9-]+\/(submit|hint|report-issue)$/, /^jobs\/[a-zA-Z0-9-]+\/retry$/, /^review\/start$/],
};
type Context={params:Promise<{parts?:string[]}>};
async function relay(request:Request,context:Context,method:'GET'|'POST'){
  const path=(await context.params).parts?.join('/')??'';
  if(!allowed[method].some(pattern=>pattern.test(path))) return NextResponse.json({detail:'没有这个学习入口'},{status:404});
  const input=new URL(request.url).searchParams;
  const query=new URLSearchParams();
  if(path==='collection') for(const key of ['source','stage','knowledge_point','limit','offset']){
    const value=input.get(key);if(value!==null) query.set(key,value);
  }
  return relayAuthenticatedRequest(request,`/me/learning/${path}${query.size?'?'+query.toString():''}`,method);
}
export const GET=(request:Request,context:Context)=>relay(request,context,'GET');
export const POST=(request:Request,context:Context)=>relay(request,context,'POST');
