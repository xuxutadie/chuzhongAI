import {NextResponse} from 'next/server';
import {relayAuthenticatedRequest,relayAuthenticatedBinaryRequest} from '../../_backend';
import {isSameSiteRegistrationRequest} from '../../server-request-origin';
import {allowedEducationRoute} from '../../../education/route_rules';
export const dynamic='force-dynamic';
async function proxy(request:Request,context:{params:Promise<{parts?:string[]}>}){
  const {parts=[]}=await context.params;
  if(!allowedEducationRoute(parts,request.method))return NextResponse.json({detail:'接口不存在'},{status:404});
  if(request.method!=='GET'&&!isSameSiteRegistrationRequest(request))return NextResponse.json({detail:'请从本站操作'},{status:403});
  const search=new URLSearchParams();
  for(const [key,value] of new URL(request.url).searchParams)if(['name','offset','limit','kind'].includes(key))search.set(key,value);
  const path='/education/'+parts.join('/')+(search.size?'?'+search:'');
  const response=parts.at(-1)==='pdf'||parts.at(-1)==='image'
    ?await relayAuthenticatedBinaryRequest(request,path):await relayAuthenticatedRequest(request,path,request.method);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}
export {proxy as GET,proxy as POST,proxy as PUT};
