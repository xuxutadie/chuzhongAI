import {NextResponse} from 'next/server';
import {callBackend,currentSessionToken,getExpectedUserHeader,EXPECTED_USER_ID_HEADER,relayAuthenticatedRequest,relayAuthenticatedBinaryRequest,relayBackendResponse} from '../../../_backend';
import {isSameSiteRegistrationRequest} from '../../../server-request-origin';
import {allowedKnowledgeRoute} from '../route_rules';
import {forwardEducationHeaders} from '../../../../education/route_rules';
export const dynamic='force-dynamic';
type Context={params:Promise<{parts?:string[]}>};

async function proxy(request:Request,context:Context) {
  const {parts=[]}=await context.params;
  const query=new URL(request.url).searchParams;
  if(!allowedKnowledgeRoute(parts,request.method,query)) return NextResponse.json({detail:'接口不存在'},{status:404});
  if(request.method!=='GET'&&!isSameSiteRegistrationRequest(request)) return NextResponse.json({detail:'请从本站操作'},{status:403});
  const path='/teacher/knowledge/'+parts.join('/')+(query.size?'?'+query.toString():'');
  let response:Response;
  if(request.method==='POST'&&parts.join('/')==='files') {
    const token=await currentSessionToken();
    if(!token) return NextResponse.json({detail:'请先登录'},{status:401});
    const expected=getExpectedUserHeader(request);
    if(!expected) return NextResponse.json({detail:'请刷新后再上传'},{status:409});
    const maximum=(/\.(png|jpe?g|webp)$/i.test(query.get('filename')||'')?5:20)*1024*1024;
    const reader=request.body?.getReader();
    const chunks:Uint8Array[]=[]; let size=0;
    try {
      while(reader) {
        const {done,value}=await reader.read(); if(done) break;
        size+=value.byteLength;
        if(size>maximum) {await reader.cancel();return NextResponse.json({detail:'文件超过大小限制'},{status:413});}
        chunks.push(value);
      }
      const bytes=new Uint8Array(size);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const headers=forwardEducationHeaders(request);
      headers.set('Content-Type','application/octet-stream');headers.set(EXPECTED_USER_ID_HEADER,expected);
      response=await relayBackendResponse(await callBackend(path,{method:'POST',headers,body:bytes,signal:AbortSignal.timeout(60000)},token));
    } catch {return NextResponse.json({detail:'上传失败，请检查服务后重试'},{status:503});}
    finally {reader?.releaseLock();}
  } else if(request.method==='GET'&&parts.at(-1)==='download') {
    response=await relayAuthenticatedBinaryRequest(request,path);
  } else response=await relayAuthenticatedRequest(request,path,request.method);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export {proxy as GET,proxy as POST,proxy as PUT,proxy as DELETE};
