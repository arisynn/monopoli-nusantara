/**
 * Compatibility exports from chronos-policy.core.mjs. These helpers pass
 * through unchanged; their callers guard actual candidates and decisions.
 */
import * as __core from './chronos-policy.core.mjs';
import { wrapModuleExport } from '../stability-guard.mjs';

export const ensureChronosCandidates = wrapModuleExport('chronos-policy', 'ensureChronosCandidates', __core.ensureChronosCandidates);
export const solveDeadWeightSale = wrapModuleExport('chronos-policy', 'solveDeadWeightSale', __core.solveDeadWeightSale);
export const temporalTelemetry = wrapModuleExport('chronos-policy', 'temporalTelemetry', __core.temporalTelemetry);
