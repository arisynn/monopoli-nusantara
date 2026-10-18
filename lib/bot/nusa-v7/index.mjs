/** NUSA V23.0 "Chronos & Kairos" model-only entrypoint. */
import {analyzeBoardGraph,GROUP_TIER} from './board-graph.mjs';
import {STRATEGY_EXPERTS,runExperts,grandmasterAuctionCeiling,predictPartnerAcceptance,solveOptimalTradeCash,projectWinProbabilityDelta} from './experts.mjs';
import {situationOf,analyzePublicCardCycles,getAuctionQuantum,APEX_TILES,STATION_GEOMETRY_MULT} from './situation.mjs';
import {nusaV7Decision,ensureSovereignCandidates,NUSA_V7_VERSION} from './council.mjs';
import {nusaV71Decision,expandNusaCandidates,choosePairedSearchEvidence,NUSA_REASONING_VERSION} from './reasoning.mjs';

export const NUSA_MODEL_VERSION='23.0.0';
export const NUSA_DEFAULT_MODE='search';
export {analyzeTemporal,turnDistance,nextTurnPlayer,TEMPORAL_POSTURES} from './temporal.mjs';
export {ensureChronosCandidates,solveDeadWeightSale} from './chronos-policy.mjs';

export {
  analyzeBoardGraph, GROUP_TIER,
  STRATEGY_EXPERTS, runExperts, grandmasterAuctionCeiling, predictPartnerAcceptance, solveOptimalTradeCash, projectWinProbabilityDelta,
  situationOf, analyzePublicCardCycles, getAuctionQuantum, APEX_TILES, STATION_GEOMETRY_MULT,
  nusaV7Decision, ensureSovereignCandidates,
  nusaV71Decision, expandNusaCandidates, choosePairedSearchEvidence,
  NUSA_V7_VERSION, NUSA_REASONING_VERSION
};

export function decideNusa(state,actor,rawPlan,options={}){
  const {mode=NUSA_DEFAULT_MODE,...rest}=options;
  if(mode==='native')return {action:rawPlan?.action??null,changed:false,reason:'native_baseline'};
  if(mode==='council')return nusaV7Decision(state,actor,rawPlan,rest);
  if(mode==='search')return nusaV71Decision(state,actor,rawPlan,{...rest,disableSearch:false});
  throw new Error('Unknown NUSA mode: ' + mode);
}
