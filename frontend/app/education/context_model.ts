/** 学校选择不是凭证；代次用于丢弃切校和切账号后迟到的响应。 */
export type SchoolContext={id:string;membership_id:string;space_revision:number;membership_revision:number;name:string;kind:string;role:string};
let owner:number|null=null, enabled=false, revision=0, selected:SchoolContext|null=null;
const listeners=new Set<()=>void>();
function changed(){revision++;for(const notify of listeners)notify();}
export function configureEducation(userId:number|null,value:boolean){
  if(owner!==userId||enabled!==value){owner=userId;enabled=value;selected=null;changed();}
}
export function selectEducation(value:SchoolContext|null){
  if(JSON.stringify(value)!==JSON.stringify(selected)){selected=value?{...value}:null;changed();}
}
export function captureEducation(){return {owner,enabled,revision,selected:selected?{...selected}:null};}
export function educationRevision(){return revision;}
export function subscribeEducation(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function assertEducationCurrent(snapshot:ReturnType<typeof captureEducation>){
  if(snapshot.owner!==owner||snapshot.revision!==revision)throw new Error('学校或账号已切换，旧操作已取消，请重新操作。');
}
export function educationHeaders(required=false):Headers{
  const headers=new Headers();
  if(enabled&&!selected&&required)throw new Error('请先选择学校或机构。');
  if(enabled&&selected){
    headers.set('X-Education-Space-Id',selected.id);
    headers.set('X-Education-Membership-Id',selected.membership_id);
    headers.set('X-Education-Space-Revision',String(selected.space_revision));
    headers.set('X-Education-Membership-Revision',String(selected.membership_revision));
  }
  return headers;
}
export function educationBinaryUrl(path:string,userId:number){
  const url=new URL(path,'https://local.invalid');
  url.searchParams.set('expected_user_id',String(userId));
  for(const [key,value] of educationHeaders(true))url.searchParams.set(key.toLowerCase(),value);
  return url.pathname+url.search;
}
