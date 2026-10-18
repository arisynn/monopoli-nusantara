/**
 * Compatibility exports from mind.core.mjs. Only decideMind is guarded;
 * observation, rollout policies and search helpers keep native behavior.
 */
import * as __core from './mind.core.mjs';
import { wrapModuleExport } from './stability-guard.mjs';

export const MIND_VERSION = wrapModuleExport('mind', 'MIND_VERSION', __core.MIND_VERSION);
export const MODELS = wrapModuleExport('mind', 'MODELS', __core.MODELS);
export const decideMind = wrapModuleExport('mind', 'decideMind', __core.decideMind);
export const difficultyFor = wrapModuleExport('mind', 'difficultyFor', __core.difficultyFor);
export const diverseRoots = wrapModuleExport('mind', 'diverseRoots', __core.diverseRoots);
export const hashSeed = wrapModuleExport('mind', 'hashSeed', __core.hashSeed);
export const observation = wrapModuleExport('mind', 'observation', __core.observation);
export const positionValue = wrapModuleExport('mind', 'positionValue', __core.positionValue);
export const rolloutPolicy = wrapModuleExport('mind', 'rolloutPolicy', __core.rolloutPolicy);
export const sampleWorld = wrapModuleExport('mind', 'sampleWorld', __core.sampleWorld);
export const seeded = wrapModuleExport('mind', 'seeded', __core.seeded);
export const simulationActor = wrapModuleExport('mind', 'simulationActor', __core.simulationActor);
export const validDifficulty = wrapModuleExport('mind', 'validDifficulty', __core.validDifficulty);
