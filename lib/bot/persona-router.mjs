/** Unified, independent strategic persona router. No training, no network, no hidden deck access. */
import {decideMind,observation} from './mind.mjs';
import {planDecision} from './strategy.mjs';
import {legalCandidate} from './candidates.mjs';
import {decideNusa,NUSA_MODEL_VERSION} from './nusa-v7/index.mjs';
import {apexPolicyAction,APEX_ADAPTER_VERSION} from './apex-policy.mjs';

export const STRATEGIC_PERSONAS=Object.freeze(['nusa','apex']);
/** Decisions returned here are always drawn from the original engine-legal plan. */
export function decidePersona(state,actor,options={}){
  const persona=state?.players?.[actor]?.botPersona;
  if(!STRATEGIC_PERSONAS.includes(persona))return decideMind(state,actor,options);
  const started=performance.now();
  const view=observation(state,actor);
  // Both strategic personas use the same economy/rules planner as their floor.
  // Explicitly disable learned-policy inputs. Opponent personalities stay public.
  const base=planDecision(view,actor,{fast:false,noLearning:true});
  if(!base.action)return {...base,diagnostics:{model:persona==='nusa'?'NUSA-V7.2':'APEX-JS-1.0',algorithm:'no_action',persona}};
  let selected;
  try{
    selected=persona==='nusa'
      ?decideNusa(view,actor,base,{mode:options.nusaMode==='search'?'search':'council',maxMs:Math.min(24,options.timeBudgetMs??24),maxNodes:32})
      :apexPolicyAction(view,actor,base);
  }catch{
    // Never leave a match stuck because an expert or Apex heuristic failed.
    selected={action:base.action,changed:false,reason:'expert_exception_economic_fallback'};
  }
  const proposed=selected?.action;
  const eligible=base.candidates.some(c=>JSON.stringify(c.action)===JSON.stringify(proposed));
  const valid=eligible&&legalCandidate(view,actor,proposed);
  const action=valid?proposed:base.action;
  return {...base,action,shouldConsult:false,diagnostics:{
    version:persona==='nusa'?NUSA_MODEL_VERSION:APEX_ADAPTER_VERSION,
    model:persona==='nusa'?'NUSA-V7.2':'APEX-JS-1.0',
    algorithm:persona==='nusa'?'knowledge-expert-council':'sonnet-apex-adaptation',
    persona,selectedBy:valid&&selected.changed?'strategic-persona':'economic-floor',
    reason:valid?selected.reason:'illegal_proposal_rejected',actor,
    elapsedMs:performance.now()-started,nodes:selected?.search?.nodes??0,
    samples:selected?.search?.pairedSamples??0,learning:{enabled:false},
    selected:action.actionId,search:[]
  }};
}
