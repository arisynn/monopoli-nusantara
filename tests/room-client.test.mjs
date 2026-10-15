import test from 'node:test';
import assert from 'node:assert/strict';
import {sameRoom,mergeState,acceptRevision,retryDelay,requestJSON,ConnectionError} from '../lib/room-client.mjs';
import {normalizePreferences} from '../lib/preferences.mjs';
test('late room responses cannot roll back the current game revision',()=>{
 const current={matchId:'one',version:8};assert.equal(mergeState(current,{matchId:'one',version:7}),current);assert.equal(acceptRevision(8,7),false);assert.equal(acceptRevision(8,8),true);assert.equal(acceptRevision(8,9),true);assert.equal(acceptRevision(8,NaN),false);
 assert.equal(sameRoom({code:'ABC123',token:'old'},{code:'ABC123',token:'new'}),false);assert.equal(mergeState(current,{matchId:'two',version:0}).matchId,'two');
});
test('connection retry backs off with a finite cap',()=>{assert.equal(retryDelay(0),1800);assert(retryDelay(1)>retryDelay(0));assert.equal(retryDelay(100),15000)});
test('requests distinguish server rejection from connection failure and respect cancellation',async()=>{
 assert.equal((await requestJSON('/api/game',{},async(_url,options)=>{assert.equal(options.cache,'no-store');assert(options.signal);return Response.json({roomRevision:4})})).roomRevision,4);
 await assert.rejects(requestJSON('/api/game',{},async()=>Response.json({error:'Kas tidak cukup.'},{status:400})),e=>!(e instanceof ConnectionError)&&e.message==='Kas tidak cukup.');
 await assert.rejects(requestJSON('/api/game',{},async()=>{throw Error('offline')}),ConnectionError);
 const controller=new AbortController();controller.abort();await assert.rejects(requestJSON('/api/game',{signal:controller.signal},async(_url,options)=>{assert(options.signal.aborted);throw Error('aborted')}),ConnectionError);
});
test('corrupt preferences recover to a usable board and preserve reduced-motion preference',()=>{
 assert.equal(normalizePreferences(null,true).reduced,true);assert.equal(normalizePreferences({quality:'unknown'}).view,'follow');assert.equal(normalizePreferences({view:'top'}).view,'overview');assert.equal(normalizePreferences({quality:'low',sound:true,view:'follow'}).view,'follow');assert.equal(normalizePreferences({view:'locked'}).view,'overview');
});
