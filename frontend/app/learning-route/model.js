export const STEP_TITLES=['课堂诊断','针对学习','过关测试','错题巩固','今日总结'];
export const STAGE_LABELS={pending_verification:'待核实',understanding:'理解原题',variant:'变式巩固',extension:'拓展应用',review:'间隔复习',mastered:'阶段掌握',challenge:'可选挑战'};
export function routeCards(route){
  return STEP_TITLES.map((title,index)=>{
    const step=index+1;
    const status=route?.steps?.[index]?.status??(step===1?'available':'locked');
    const done=['completed','not_required'].includes(status);
    const current=route?.current_step===step;
    return {step,title,status,disabled:!route||(!done&&!current),
      action:done?'回看':current?(status==='in_progress'?'继续':'开始'):'未解锁',
      reason:done?(status==='not_required'?'无需订正':'已完成'):current?'只做当前这一步':`完成第 ${step-1} 步后解锁`};
  });
}
