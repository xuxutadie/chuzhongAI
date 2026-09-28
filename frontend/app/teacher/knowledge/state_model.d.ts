export function canReviewQuestion(question: Partial<import('./types').Question>): boolean;
export function validateGeneration(form: {original_count:number;variant_count:number;reference_version_ids:string[];allow_ai_fill?:boolean}): {errors:string[]};
export function isCurrentResponse(requestOwner:number,activeOwner:number,requestVersion:number,activeVersion:number):boolean;
export function assertCurrentSession(start:{owner:number|null;epoch:number},current:{owner:number|null;epoch:number},aborted?:boolean):void;
export function matchesChapterDraft(draft:Pick<import('./types').Chapter,'title'|'notes'|'sources'|'knowledge_point_ids'|'prerequisite_ids'>|undefined,values:Pick<import('./types').Chapter,'title'|'notes'|'sources'|'knowledge_point_ids'|'prerequisite_ids'>):boolean;
