import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAYER_NAME_KEY,loadPlayerName,savePlayerName,requirePlayerName,normalizePlayerName} from '../lib/player-name.mjs';
import {localPlayers} from '../lib/bot/personas.mjs';

test('no human name default: profile starts blank until a user explicitly enters one',()=>{
 const storage={data:new Map(),getItem(k){return this.data.get(k)||null},setItem(k,v){this.data.set(k,v)}};
 assert.equal(loadPlayerName(storage),'');
 assert.throws(()=>requirePlayerName(''),/Isi nama/);
 assert.throws(()=>requirePlayerName('a'),/Isi nama/);
 assert.throws(()=>localPlayers('',4),/Isi nama/);
 assert.equal(savePlayerName('  Naya     Putri  ',storage),'Naya Putri');
 assert.equal(storage.data.get(PLAYER_NAME_KEY),'Naya Putri');
 assert.equal(loadPlayerName(storage),'Naya Putri');
 assert.equal(localPlayers(loadPlayerName(storage),4)[0].name,'Naya Putri');
});

test('normalization and length bounds prevent zero-width chars and overlong names',()=>{
 assert.equal(normalizePlayerName('  Awan\tBirU  '),'Awan BirU');
 for(const input of ['A'.repeat(25),'R\u200Bani','\n\n','<'])assert.throws(()=>requirePlayerName(input),/Isi nama/);
 assert.equal(requirePlayerName('Aris_95'),'Aris_95');
});

test('profile and pause HTML/CSS keep avatar independent of flexible text',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../frontend/styles.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../frontend/app.mjs',import.meta.url),'utf8');
 const popups=readFileSync(new URL('../frontend/popups.mjs',import.meta.url),'utf8');
 assert(css.includes('.room-members > div > .room-member-identity'));
 assert(css.includes('.room-members > div > .avatar'));
 assert(!css.includes('.room-members > div > span {'));
 assert(css.includes('.connection-note > button > .connection-note-label'));
 assert(!css.includes('.connection-note > button > span {'));
 assert(app.includes('name: loadPlayerName()'));
 assert(app.includes('case "myProfile"'));
 assert(app.includes('Dijeda · ${ready}/${humans} siap lanjut'));
 assert(popups.includes('class="room-member-identity"'));
});
