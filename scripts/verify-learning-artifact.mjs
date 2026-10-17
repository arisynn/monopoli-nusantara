import {LEARNED_MODEL} from '../lib/bot/learned-model.mjs';
import {validLearningModel} from '../lib/bot/learning.mjs';
import {mindProvenance} from './mind-provenance.mjs';

export function verifyLearningArtifact(model, sourceHash) {
  if (model === null) return {active: false};
  if (!validLearningModel(model) || model.status !== 'promoted')
    throw new Error('Runtime learning artifact must be valid and promoted; use null for safe integration.');
  if (model.training?.sourceHash !== sourceHash || model.evidence?.sourceHash !== sourceHash)
    throw new Error('Learning artifact source hash is stale. Retrain and pass held-out promotion before building.');
  return {active: true, sourceHash};
}
verifyLearningArtifact(LEARNED_MODEL, mindProvenance().sourceHash);
