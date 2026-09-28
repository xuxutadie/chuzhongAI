export function canReviewQuestion(q) {
  return Boolean(q.prompt?.trim() && q.explanation?.trim() && Object.keys(q.answer || {}).length
    && q.scope?.chapter_version_ids?.length && q.scope?.knowledge_point_ids?.length
    && (!q.needs_figure || q.asset_ids?.length) && !q.checks?.length);
}
export function validateGeneration(form) {
  const errors=[];
  const total=form.original_count+form.variant_count;
  if(!Number.isInteger(total)||total<1||total>50||form.original_count<0||form.variant_count<0) errors.push('每次生成 1—50 道题');
  if(form.original_count>(form.reference_version_ids?.length||0)) errors.push('已选原题不足，请补充题库');
  if(form.variant_count&&!form.reference_version_ids?.length&&!form.allow_ai_fill) errors.push('请选参考题，或明确允许依据教材补题');
  return {errors};
}
export function isCurrentResponse(requestOwner,activeOwner,requestVersion,activeVersion) {
  return requestOwner===activeOwner && requestVersion===activeVersion;
}
export function assertCurrentSession(start,current,aborted=false) {
  if(aborted||!isCurrentResponse(start.owner,current.owner,start.epoch,current.epoch))throw Error('账号已变化或操作已取消，请重新开始');
}
export function matchesChapterDraft(draft,values) {
  if(!draft)return false;
  const normalized=value=>[value.title,value.notes,value.knowledge_point_ids,value.prerequisite_ids,value.sources.map(s=>[s.file_id,s.kind,s.index])];
  return JSON.stringify(normalized(draft))===JSON.stringify(normalized(values));
}
