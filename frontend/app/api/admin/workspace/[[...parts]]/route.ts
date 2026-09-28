import {NextResponse} from 'next/server';
import {getExpectedUserHeader,relayAuthenticatedRequest,relayAuthenticatedBinaryRequest} from '../../../_backend';
import {isSameSiteRegistrationRequest} from '../../../server-request-origin';
import {allowedAdminRoute} from '../route_rules';
export const dynamic='force-dynamic';
type Context={params:Promise<{parts?:string[]}>};
async function proxy(request:Request,context:Context){
  const {parts=[]}=await context.params;
  const query=new URL(request.url).searchParams;
  if(!allowedAdminRoute(parts,request.method,query))return NextResponse.json({detail:'接口不存在'},{status:404});
  if(request.method!=='GET'&&!isSameSiteRegistrationRequest(request))return NextResponse.json({detail:'请从本站操作'},{status:403});
  const binary=request.method==='GET'&&['pdf','image'].includes(parts.at(-1)||'');
  if(!getExpectedUserHeader(request,binary))return NextResponse.json({detail:'请刷新页面后重新操作'},{status:409});
  query.delete('expected_user_id');
  const path='/admin/'+parts.join('/')+(query.size?'?'+query.toString():'');
  const response=binary?await relayAuthenticatedBinaryRequest(request,path):await relayAuthenticatedRequest(request,path,request.method);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export {proxy as GET,proxy as POST,proxy as PUT};
