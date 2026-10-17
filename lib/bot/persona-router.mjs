/** Unified, independent 6-Persona Grandmaster Router
 * (NUSA V11.0, KRESNA V2.0, APEX V3.0, Raka V3.0, Bima V3.0, Sari V3.0).
 */
import {decideMind,observation,difficultyFor} from './mind.mjs';
import {planDecision} from './strategy.mjs';
import {legalCandidate} from './candidates.mjs';
import {decideNusa,NUSA_MODEL_VERSION} from './nusa-v7/index.mjs';
import {apexPolicyAction,APEX_ADAPTER_VERSION} from './apex-policy.mjs';
import {kresnaPolicyAction,KRESNA_MODEL_VERSION} from './kresna-policy.mjs';

export const STRATEGIC_PERSONAS=Object.freeze(['nusa','kresna','apex']);

export function decidePersona(state,actor,options={}){
  const persona=state?.players?.[actor]?.botPersona;
  if(!STRATEGIC_PERSONAS.includes(persona))return decideMind(state,actor,options);
  const started=performance.now();
  const view=observation(state,actor);
  const diff=options.difficulty||difficultyFor(view,actor);

  const base=planDecision(view,actor,{fast:false,noLearning:true});
  const modelLabel=persona==='nusa'?'NUSA-V11.0':persona==='kresna'?'KRESNA-V2.0':'APEX-JS-3.0';
  if(!base.action)return {...base,diagnostics:{model:modelLabel,algorithm:'no_action',persona}};

  let selected;
  try{
    if(persona==='nusa'){
      const requestedMode=options.nusaMode??(diff==='hardcore'?'search':'council');
      const maxMs=Math.min(180,Math.max(16,options.timeBudgetMs??(diff==='hardcore'?120:24)));
      selected=decideNusa(view,actor,base,{mode:requestedMode,maxMs,maxNodes:diff==='hardcore'?96:32});
    }else if(persona==='kresna'){
      selected=kresnaPolicyAction(view,actor,base);
    }else{
      selected=apexPolicyAction(view,actor,base);
    }
  }catch{
    selected={action:base.action,changed:false,reason:'expert_exception_economic_fallback'};
  }

  const proposed=selected?.action;
  const matched=base.candidates.find(c=>JSON.stringify(c.action)===JSON.stringify(proposed));
  const valid=!!matched&&legalCandidate(view,actor,proposed);
  const action=valid?matched.action:base.action;

  return {
    ...base,
    action,
    shouldConsult:false,
    diagnostics:{
      version:persona==='nusa'?NUSA_MODEL_VERSION:persona==='kresna'?KRESNA_MODEL_VERSION:APEX_ADAPTER_VERSION,
      model:modelLabel,
      algorithm:persona==='nusa'?'sovereign-grandmaster-v11':persona==='kresna'?'quantum-dcf-nash-v2':'sonnet-apex-v3-predator',
      persona,
      selectedBy:valid&&selected.changed?'strategic-persona':'economic-floor',
      reason:valid?selected.reason:'illegal_proposal_rejected',
      actor,
      elapsedMs:performance.now()-started,
      nodes:selected?.search?.nodes??0,
      samples:selected?.search?.pairedSamples??0,
      learning:{enabled:false},
      selected:action.actionId,
      search:[]
    }
  };
}
