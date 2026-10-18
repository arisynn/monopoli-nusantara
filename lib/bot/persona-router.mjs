import {decideMind,observation} from './mind.mjs';
import {planDecision} from './strategy.mjs';
import {legalCandidate} from './candidates.mjs';
import {decideNusa,NUSA_MODEL_VERSION} from './nusa-v7/index.mjs';
import {cleanAction} from './nusa-v7/council.mjs';
import {apexPolicyAction,APEX_ADAPTER_VERSION} from './apex-policy.mjs';
import {kresnaPolicyAction,KRESNA_MODEL_VERSION} from './kresna-policy.mjs';

export const STRATEGIC_PERSONAS=Object.freeze(['nusa','kresna','apex']);

export function decidePersona(state,actor,options={}){
  const persona=state?.players?.[actor]?.botPersona;
  if(!STRATEGIC_PERSONAS.includes(persona))return decideMind(state,actor,options);
  const started=performance.now();
  const view=observation(state,actor);
  const base=planDecision(view,actor,{fast:false,noLearning:true});
  const modelLabel=persona==='nusa'?'NUSA-V17.0-OMNISCIENCE':persona==='kresna'?'KRESNA-V2.0':'APEX-JS-3.0';
  if(!base.action)return {...base,diagnostics:{model:modelLabel,algorithm:'no_action',persona}};

  let selected;
  try{
    if(persona==='nusa'){
      const budgetMs=Number.isFinite(options.timeBudgetMs)?options.timeBudgetMs:(options.deep?2600:64);
      const maxNodes=options.deep||budgetMs>=1500?2800:220;
      selected=decideNusa(view,actor,base,{
        mode:options.nusaMode||'search',
        maxMs:budgetMs,
        maxNodes,
        deep:!!options.deep||budgetMs>=1500
      });
    }else if(persona==='kresna'){
      selected=kresnaPolicyAction(view,actor,base);
    }else{
      selected=apexPolicyAction(view,actor,base);
    }
  }catch{
    selected={action:base.action,changed:false,reason:'fallback'};
  }

  const proposed=selected?.action;
  const matched=base.candidates.find(c=>JSON.stringify(cleanAction(c.action))===JSON.stringify(cleanAction(proposed)));
  const candidateAction=matched?matched.action:proposed;
  const valid=!!candidateAction&&legalCandidate(view,actor,candidateAction);
  const action=valid?candidateAction:base.action;

  return {
    ...base, action, shouldConsult:false,
    diagnostics:{
      version:persona==='nusa'?NUSA_MODEL_VERSION:persona==='kresna'?KRESNA_MODEL_VERSION:APEX_ADAPTER_VERSION,
      model:modelLabel, algorithm:'total-mechanical-omniscience-v17.0', persona,
      selectedBy:valid&&selected.changed?'strategic-persona':'economic-floor',
      reason:valid?selected.reason:'illegal_proposal_rejected',
      actor, elapsedMs:performance.now()-started, nodes:selected?.search?.nodes??0, samples:selected?.search?.pairedSamples??0, learning:{enabled:false}, selected:action.actionId, search:[]
    }
  };
}
