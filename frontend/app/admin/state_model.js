export function accountActions(account,actorId){
  if(account.state==='deleted')return ['restore'];
  const base=['edit','reset-password'];
  return account.id===actorId?base:[...base,account.state==='active'?'disable':'enable','delete'];
}
export function isCurrentAdminResponse(start,current){
  return start.owner===current.owner&&start.epoch===current.epoch&&start.path===current.path;
}
