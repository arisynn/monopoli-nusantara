/**
 * ₦USA V7.2 model-only entrypoint.
 * Designed for inclusion in Monopoli Nusantara source tree.
 * No game engine, data, secrets, or learning checkpoints included.
 */
import {STRATEGY_EXPERTS,runExperts} from './experts.mjs';
import {situationOf} from './situation.mjs';
import {nusaV7Decision,NUSA_V7_VERSION} from './council.mjs';
import {nusaV71Decision,expandNusaCandidates,choosePairedSearchEvidence,NUSA_REASONING_VERSION} from './reasoning.mjs';

export const NUSA_MODEL_VERSION='7.2.0';
export const NUSA_DEFAULT_MODE='council';
export {STRATEGY_EXPERTS,runExperts,situationOf,nusaV7Decision,nusaV71Decision,
  expandNusaCandidates,choosePairedSearchEvidence,NUSA_V7_VERSION,NUSA_REASONING_VERSION};

/**
 * @param {object} state Authoritative Nusantara game state (never mutated).
 * @param {number} actor Acting player index.
 * @param {object} plan Native planDecision(state,actor,...) result with legal candidates.
 * @param {object} options mode='council'|'search'|'native', diagnostics, disabled,
 *     search limits (maxMs/maxNodes/maxSamples/maxRoots/horizonSteps/horizonTurns).
 * @returns {{action:object,changed:boolean,reason:string}}
 */
export function decideNusa(state,actor,plan,options={}){
  const {mode=NUSA_DEFAULT_MODE,...rest}=options;
  if(mode==='native')return {action:plan?.action??null,changed:false,reason:'native_baseline'};
  if(mode==='council')return nusaV7Decision(state,actor,plan,rest);
  if(mode==='search')return nusaV71Decision(state,actor,plan,{...rest,disableSearch:false});
  throw new Error(`Unknown ₦USA mode: ${mode}`);
}
