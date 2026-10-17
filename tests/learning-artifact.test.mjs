import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyLearningArtifact} from '../scripts/verify-learning-artifact.mjs';
import {createLearningModel} from '../lib/bot/learning.mjs';
test('build accepts disabled learning without enabling a candidate',()=>{
 assert.deepEqual(verifyLearningArtifact(null,'current'),{active:false});
 assert.throws(()=>verifyLearningArtifact(createLearningModel(),'current'),/promoted/);
});
test('build rejects promoted learning from a different engine or strategy source',()=>{
 const m=createLearningModel();m.status='promoted';m.training.sourceHash='old';m.evidence={sourceHash:'current'};
 assert.throws(()=>verifyLearningArtifact(m,'current'),/stale/);
 m.training.sourceHash='current';m.evidence.sourceHash='old';assert.throws(()=>verifyLearningArtifact(m,'current'),/stale/);
});
test('build accepts only valid promoted weights matching training and evidence source',()=>{
 const m=createLearningModel();m.status='promoted';m.training.sourceHash='current';m.evidence={sourceHash:'current'};
 assert.equal(verifyLearningArtifact(m,'current').active,true);
 m.value[0]=NaN;assert.throws(()=>verifyLearningArtifact(m,'current'),/valid/);
});
