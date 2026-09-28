const uuid='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const uuidRE=new RegExp('^'+uuid+'$');
export function forwardEducationHeaders(request:Request,queryFallback=false){
  const result=new Headers(),query=new URL(request.url).searchParams;
  for(const suffix of ['Space-Id','Membership-Id','Space-Revision','Membership-Revision']){
    const name='X-Education-'+suffix;
    const value=request.headers.get(name)??(queryFallback?query.get(name.toLowerCase()):null);
    if(value&&(suffix.endsWith('Id')?uuidRE.test(value):/^[1-9]\d{0,8}$/.test(value)))result.set(name,value);
  }
  return result;
}
export function allowedEducationRoute(parts:string[],method:string){
  const path=parts.join('/');
  const routes:Record<string,string[]>={
    GET:['status','me/spaces','spaces','grants',`spaces/${uuid}/members`,`spaces/${uuid}/ai`,
      'students','students/[1-9]\\d*','students/[1-9]\\d*/history',
      `students/[1-9]\\d*/assessments/${uuid}(/pdf)?`,'students/[1-9]\\d*/wrong-questions/[1-9]\\d*(/image)?'],
    POST:['spaces',`spaces/${uuid}/state`,'member-invitations','member-invitations/(accept|preview)',
      `members/${uuid}/(state|role)`,'history-invitations','history-invitations/preview','grants',`grants/${uuid}/revoke`],
    PUT:[`spaces/${uuid}/ai/(llm|ocr)`],
  };
  return (routes[method]??[]).some(pattern=>new RegExp('^(?:'+pattern+')$').test(path));
}
