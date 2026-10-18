/**
 * Compatibility exports from index.core.mjs. Only decision entrypoints are
 * guarded; candidate synthesis, experts, forecasts and telemetry stay native.
 */
import * as __core from './index.core.mjs';
import { wrapModuleExport } from '../stability-guard.mjs';

export const APEX_TILES = wrapModuleExport('index', 'APEX_TILES', __core.APEX_TILES);
export const GROUP_TIER = wrapModuleExport('index', 'GROUP_TIER', __core.GROUP_TIER);
export const NUSA_DEFAULT_MODE = wrapModuleExport('index', 'NUSA_DEFAULT_MODE', __core.NUSA_DEFAULT_MODE);
export const NUSA_MODEL_VERSION = wrapModuleExport('index', 'NUSA_MODEL_VERSION', __core.NUSA_MODEL_VERSION);
export const NUSA_REASONING_VERSION = wrapModuleExport('index', 'NUSA_REASONING_VERSION', __core.NUSA_REASONING_VERSION);
export const NUSA_V7_VERSION = wrapModuleExport('index', 'NUSA_V7_VERSION', __core.NUSA_V7_VERSION);
export const STATION_GEOMETRY_MULT = wrapModuleExport('index', 'STATION_GEOMETRY_MULT', __core.STATION_GEOMETRY_MULT);
export const STRATEGY_EXPERTS = wrapModuleExport('index', 'STRATEGY_EXPERTS', __core.STRATEGY_EXPERTS);
export const TEMPORAL_POSTURES = wrapModuleExport('index', 'TEMPORAL_POSTURES', __core.TEMPORAL_POSTURES);
export const analyzeBoardGraph = wrapModuleExport('index', 'analyzeBoardGraph', __core.analyzeBoardGraph);
export const analyzePublicCardCycles = wrapModuleExport('index', 'analyzePublicCardCycles', __core.analyzePublicCardCycles);
export const analyzeTemporal = wrapModuleExport('index', 'analyzeTemporal', __core.analyzeTemporal);
export const choosePairedSearchEvidence = wrapModuleExport('index', 'choosePairedSearchEvidence', __core.choosePairedSearchEvidence);
export const decideNusa = wrapModuleExport('index', 'decideNusa', __core.decideNusa);
export const ensureChronosCandidates = wrapModuleExport('index', 'ensureChronosCandidates', __core.ensureChronosCandidates);
export const ensureSovereignCandidates = wrapModuleExport('index', 'ensureSovereignCandidates', __core.ensureSovereignCandidates);
export const expandNusaCandidates = wrapModuleExport('index', 'expandNusaCandidates', __core.expandNusaCandidates);
export const getAuctionQuantum = wrapModuleExport('index', 'getAuctionQuantum', __core.getAuctionQuantum);
export const grandmasterAuctionCeiling = wrapModuleExport('index', 'grandmasterAuctionCeiling', __core.grandmasterAuctionCeiling);
export const nextTurnPlayer = wrapModuleExport('index', 'nextTurnPlayer', __core.nextTurnPlayer);
export const nusaV71Decision = wrapModuleExport('index', 'nusaV71Decision', __core.nusaV71Decision);
export const nusaV7Decision = wrapModuleExport('index', 'nusaV7Decision', __core.nusaV7Decision);
export const predictPartnerAcceptance = wrapModuleExport('index', 'predictPartnerAcceptance', __core.predictPartnerAcceptance);
export const projectWinProbabilityDelta = wrapModuleExport('index', 'projectWinProbabilityDelta', __core.projectWinProbabilityDelta);
export const runExperts = wrapModuleExport('index', 'runExperts', __core.runExperts);
export const situationOf = wrapModuleExport('index', 'situationOf', __core.situationOf);
export const solveDeadWeightSale = wrapModuleExport('index', 'solveDeadWeightSale', __core.solveDeadWeightSale);
export const solveOptimalTradeCash = wrapModuleExport('index', 'solveOptimalTradeCash', __core.solveOptimalTradeCash);
export const turnDistance = wrapModuleExport('index', 'turnDistance', __core.turnDistance);
