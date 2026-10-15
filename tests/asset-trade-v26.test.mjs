import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,command,managementError} from '../lib/game.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const setup=()=>createGame({players:[{name:'Raka'},{name:'Dina'}],startingRoll:false},()=>.2);
const offer=(changes={})=>({to:1,give:[1],take:[6],giveCash:100,takeCash:0,giveCards:0,takeCards:0,...changes});
test('asset management still requires the complete color group',()=>{
 const s=setup();s.assets[1].owner=0;
 assert.equal(managementError(s,0,1,'BUILD'),'Lengkapi kelompok warna dahulu.');
 s.assets[3].owner=0;assert.equal(managementError(s,0,1,'BUILD'),null);
});
test('a valid offer still uses the original engine and transfers assets and cash',()=>{
 const s=setup();s.assets[1].owner=0;s.assets[6].owner=1;
 const pending=command(s,0,{type:'OFFER',trade:offer()});
 assert.equal(pending.phase,'trade');assert.equal(pending.trade.to,1);
 const accepted=command(pending,1,{type:'TRADE_ACCEPT'});
 assert.equal(accepted.assets[1].owner,1);
 assert.equal(accepted.assets[6].owner,0);
 assert.equal(accepted.players[0].cash,14900);
 assert.equal(accepted.players[1].cash,15100);
});
test('counter-offer preserves the opposite party and can be accepted',()=>{
 const s=setup();s.assets[1].owner=0;s.assets[6].owner=1;
 const pending=command(s,0,{type:'OFFER',trade:offer()});
 const counter=command(pending,1,{type:'COUNTER',trade:{to:0,give:[6],take:[1],giveCash:0,takeCash:150,giveCards:0,takeCards:0}});
 assert.equal(counter.trade.from,1);assert.equal(counter.trade.to,0);
 const accepted=command(counter,0,{type:'TRADE_ACCEPT'});
 assert.equal(accepted.assets[1].owner,1);assert.equal(accepted.assets[6].owner,0);
 assert.equal(accepted.players[0].cash,14850);assert.equal(accepted.players[1].cash,15150);
});
test('properties in a developed color group cannot be bartered even if the chosen property has no building',()=>{
 const s=setup();s.assets[1].owner=0;s.assets[3].owner=0;s.assets[6].owner=1;s.assets[1].level=1;
 assert.throws(()=>command(s,0,{type:'OFFER',trade:offer({give:[3]})}),/Jual bangunan dalam kelompok/);
});
test('trade wizard keeps the specialty rules and does not allow empty offers or moving the counter recipient',()=>{
 const wizard=read('../components/game/TradeWizard.tsx');const game=read('../components/game/Game.tsx');const css=read('../app/globals.css');
 for(const text of ['!hasValue','invalid','Math.min(max','developed','mode!==\'counter\'||i>0','mode===\'counter\'?step>1:step>0'])assert(wizard.includes(text),text);
 assert(game.includes("if(await act('COUNTER',{trade:submitted}))setSheet(null)"));
 assert(css.includes('var(--gold)')&&css.includes('var(--bg)'));
 assert.equal(read('../public/sw.js').includes('nusantara-v26'),true);
});
