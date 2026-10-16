import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {outputFingerprint} from '../scripts/build-fingerprint.mjs';
test('build identity changes for dependency-only and asset-only changes and is stable otherwise',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'nusa-fingerprint-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 await mkdir(join(dir,'lib'));await mkdir(join(dir,'assets'));
 await writeFile(join(dir,'lib/session.mjs'),'export const state=1;');await writeFile(join(dir,'assets/pawn.png'),new Uint8Array([1,2,3]));
 const root=pathToFileURL(dir+'/'),a=await outputFingerprint(root);assert.equal(await outputFingerprint(root),a);
 await writeFile(join(dir,'lib/session.mjs'),'export const state=2;');const b=await outputFingerprint(root);assert.notEqual(b,a);
 await writeFile(join(dir,'assets/pawn.png'),new Uint8Array([1,2,4]));assert.notEqual(await outputFingerprint(root),b);
});

import {APP_VERSION,RULEPACK_VERSION,ENGINE_SCHEMA_VERSION} from '../lib/version.mjs';
import {createGame} from '../lib/game.mjs';
test('package, health and build metadata agree with the active release and engine contract',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 const state=createGame({players:[{name:'A'},{name:'B'}]},()=>.2);
 assert.equal(pkg.version,APP_VERSION);assert.equal(state.rulepackVersion,RULEPACK_VERSION);assert.equal(state.schemaVersion,ENGINE_SCHEMA_VERSION);
 const {handleRequest}=await import('../adapters/node/router.mjs');const health=await(await handleRequest(new Request('http://test/health'))).json();
 assert.equal(health.version,APP_VERSION);assert.equal(health.engineSchemaVersion,ENGINE_SCHEMA_VERSION);
 const build=JSON.parse(await readFile(new URL('../dist/build.json',import.meta.url),'utf8'));assert.equal(build.version,APP_VERSION);assert.equal(build.rulepackVersion,RULEPACK_VERSION);
});
