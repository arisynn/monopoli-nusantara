import {blockedFinance,financeMemory,cleanFinancePath} from './finance-history.mjs';
import {legalCandidate} from './candidates.mjs';
import {stabilizeDecision} from './stability-guard.mjs';

// Runs for every persona, including baseOnly, worker and learned-policy paths.
export function guardFinance(s,actor,plan,context) {
  if(!plan.action)return plan;
  const pending=financeMemory(s,actor)?.pending?.[0];
  let action=plan.action,reason=null;
  if(pending&&!blockedFinance(s,actor,pending)&&legalCandidate(s,actor,pending,context)){
    action={...pending,actionId:'finance:continue'};reason='finance_plan_continued';
  }else if(blockedFinance(s,actor,action)){
    action=plan.candidates?.find(c=>!blockedFinance(s,actor,c.action)&&legalCandidate(s,actor,c.action,context))?.action;
    if(!action)return stabilizeDecision(s,{...plan,action:null,shouldConsult:false},{actor});
    reason='finance_reversal_blocked';
  }
  const selected=plan.candidates?.find(c=>c.action.type===action.type&&c.action.tile===action.tile);
  const path=selected?.macro&&cleanFinancePath(selected.macro.slice(1));
  if(action.type==='MORTGAGE'&&path)action={...action,financePlan:path};
  return stabilizeDecision(s,{...plan,action,...(reason?{shouldConsult:false,diagnostics:{...plan.diagnostics,finance:reason,selected:action.actionId}}:{})},{actor});
}
