const uuid='[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
const resource='(?:files|textbooks|chapters|chapter-versions|questions|question-versions|question-sets|sources)';
const rules={
  GET:[`^(?:${resource}|jobs|catalog|ai)$`,`^(?:${resource}|jobs)/${uuid}$`,`^files/${uuid}/download$`,`^question-sets/${uuid}/preview$`],
  POST:['^(?:files|textbooks|questions|question-sets|imports|generations|questions/merge)$',`^textbooks/${uuid}/(?:files|chapters)$`,`^(?:question-versions|chapter-versions|question-sets)/${uuid}/review$`,`^(?:files|textbooks|questions)/${uuid}/(?:archive|restore)$`,`^jobs/${uuid}/(?:cancel|retry)$`,`^question-versions/${uuid}/split$`],
  PUT:['^ai/(?:llm|ocr)$'],DELETE:['^ai/(?:llm|ocr)$'],
};
export function allowedKnowledgeRoute(parts,method,query) {
  const path=parts.join('/');
  if(!(rules[method]||[]).some(rule=>new RegExp(rule).test(path))) return false;
  const allowed=method==='GET' ? (path.endsWith('/download')?['expected_user_id','x-education-space-id','x-education-membership-id','x-education-space-revision','x-education-membership-revision']:['offset','limit','search','archived','status','grade','edition','difficulty','response_type','parent_id']) : path==='files'?['filename']:[];
  return [...query.keys()].every(key=>allowed.includes(key)&&query.getAll(key).length===1);
}
