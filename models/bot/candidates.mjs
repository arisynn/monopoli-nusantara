/**
 * Compatibility exports from candidates.core.mjs. Only generateCandidates is
 * guarded; legality checks and hypothetical transitions remain pure helpers.
 */
import * as __core from './candidates.core.mjs';
import { wrapModuleExport } from './stability-guard.mjs';

export const candidateState = wrapModuleExport('candidates', 'candidateState', __core.candidateState);
export const generateCandidates = wrapModuleExport('candidates', 'generateCandidates', __core.generateCandidates);
export const legalCandidate = wrapModuleExport('candidates', 'legalCandidate', __core.legalCandidate);
export const ruleState = wrapModuleExport('candidates', 'ruleState', __core.ruleState);
