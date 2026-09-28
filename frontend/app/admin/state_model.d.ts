export function accountActions(account:{id:number;state:string},actorId:number):string[];
export function isCurrentAdminResponse(start:{owner:number|null;epoch:number;path:string},current:{owner:number|null;epoch:number;path:string}):boolean;
