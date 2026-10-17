/** NUSA V11.0 Sovereign Grandmaster model-only entrypoint.
 * Designed for inclusion in Monopoli Nusantara source tree.
 */
import {STRATEGY_EXPERTS,runExperts,grandmasterAuctionCeiling} from './experts.mjs';
import {situationOf} from './situation.mjs';
import {nusaV7Decision,ensureSovereignCandidates,NUSA_V7_VERSION} from './council.mjs';
import {nusaV71Decision,expandNusaCandidates,choosePairedSearchEvidence,NUSA_REASONING_VERSION} from './reasoning.mjs';

export const NUSA_MODEL_VERSION='11.0.0';
export const NUSA_DEFAULT_MODE='council';

export {
  STRATEGY_EXPERTS,
  runExperts,
  grandmasterAuctionCeiling,
  situationOf,
  nusaV7Decision,
  ensureSovereignCandidates,
  nusaV71Decision,
  expandNusaCandidates,
  choosePairedSearchEvidence,
  NUSA_V7_VERSION,
  NUSA_REASONING_VERSION
};

export function decideNusa(state,actor,rawPlan,options={}){
  const {mode=NUSA_DEFAULT_MODE,...rest}=options;
  if(mode==='native')return {action:rawPlan?.action??null,changed:false,reason:'native_baseline'};
  if(mode==='council')return nusaV7Decision(state,actor,rawPlan,rest);
  if(mode==='search')return nusaV71Decision(state,actor,rawPlan,{...rest,disableSearch:false});
  throw new Error('Unknown NUSA mode: ' + mode);
}
