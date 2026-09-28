/** 管理代理只允许明确登记的业务路径，不代理任意后端接口。 */
export function allowedAdminRoute(parts,method,query) {
  if(parts.some(p=>!/^[a-zA-Z0-9-]+$/.test(p)))return false;
  const path=parts.join('/');
  const id='[1-9][0-9]*',key='[a-zA-Z0-9-]+';
  let keys=[];let methods=[];
  if(path==='accounts'){methods=['GET','POST'];keys=['search','role','state','offset','limit'];}
  else if(new RegExp(`^accounts/${id}$`).test(path))methods=['GET','PUT'];
  else if(new RegExp(`^accounts/${id}/(state|reset-password)$`).test(path))methods=['POST'];
  else if(path==='events'){methods=['GET'];keys=['target_id','offset','limit'];}
  else if(path==='view-events')methods=['POST'];
  else if(new RegExp(`^views/(students|teachers)/${id}$`).test(path))methods=['GET'];
  else if(new RegExp(`^views/students/${id}/history$`).test(path)){methods=['GET'];keys=['kind','offset','limit'];}
  else if(new RegExp(`^views/students/${id}/(assessments/${key}(/pdf)?|wrong-questions/${id}(/image)?)$`).test(path)){methods=['GET'];if(/\/(pdf|image)$/.test(path))keys=['expected_user_id'];}
  else if(new RegExp(`^views/teachers/${id}/students$`).test(path)){methods=['GET'];keys=['offset','limit'];}
  else if(new RegExp(`^views/teachers/${id}/knowledge/(textbooks|chapters|questions|question-versions|question-sets)(/${key})?$`).test(path)){methods=['GET'];keys=['offset','limit'];}
  return methods.includes(method)&&[...query.keys()].every(k=>keys.includes(k));
}
