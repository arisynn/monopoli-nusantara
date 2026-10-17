import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../lib/game.mjs';
import {estimateTrade} from '../frontend/trade-value.mjs';
import {tradeEstimateMarkup} from '../frontend/popups.mjs';
const state=()=>{const s=createGame({players:['Jovan','Sari','Bima'].map(name=>({name,controller:'human'})),startingRoll:false},()=>.2);s.assets[13]={owner:0,level:0,mortgaged:false};s.assets[5]={owner:1,level:0,mortgaged:false};return s};
const draft=(extra={})=>({from:0,to:1,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0,...extra});
test('cash-only estimate reverses correctly for the recipient and names sender perspective for an observer',()=>{
 const s=state(),t=draft({giveCash:400,takeCash:700});const a=estimateTrade(s,t,0),b=estimateTrade(s,t,1),observer=estimateTrade(s,t,2);
 assert.deepEqual([a.received,a.given,a.delta],[700,400,300]);assert.equal(b.delta,-300);assert.equal(observer.perspective,0);assert.equal(observer.delta,300);
});
test('mortgaged property uses purchase price minus immediate redemption, not gross purchase price',()=>{
 const s=state(),t=draft({give:[13],take:[5],takeCash:500});assert.equal(estimateTrade(s,t,0).delta,1100);
 s.assets[5].mortgaged=true;const before=JSON.stringify(s),q=estimateTrade(s,t,0);assert.equal(q.delta,0);assert.equal(q.received,1400);assert.equal(q.given,1400);assert(q.mortgaged);assert.equal(JSON.stringify(s),before);
});
test('changing cash updates the difference in engine units without rounding away decimal Nusa',()=>{
 const s=state(),t=draft({give:[13],take:[5],giveCash:123});assert.equal(estimateTrade(s,t,0).delta,477);t.giveCash=74;assert.equal(estimateTrade(s,t,0).delta,526);assert.equal(estimateTrade(s,t,1).delta,-526);
});
test('unpriced jail cards are flagged rather than assigned an invented price',()=>{
 const s=state();s.players[0].cards.push('chance');const q=estimateTrade(s,draft({giveCards:1}),0);assert(q.unpricedCards);assert.equal(q.delta,0);
 const html=tradeEstimateMarkup(s,draft({giveCards:1}),0);assert(html.includes('Kartu bebas penjara belum diberi nilai.'));assert(html.includes('bukan laba pasti'));
});
test('invalid, empty or stale drafts never display a misleading profit number',()=>{
 const s=state();for(const t of [draft(),draft({giveCash:NaN}),draft({giveCash:-1}),draft({give:[13,13]}),draft({give:[5]}),draft({from:999,giveCash:10})])assert.equal(estimateTrade(s,t,0),null);
 assert.equal(estimateTrade(null,draft(),0),null);
});
test('markup labels loss and gain by the viewed player and escapes observer-facing names',()=>{
 const s=state(),t=draft({giveCash:500});assert(tradeEstimateMarkup(s,t,0).includes('Estimasi rugi'));assert(tradeEstimateMarkup(s,t,1).includes('Estimasi laba'));
 s.players[0].name='<Jovan>';assert(tradeEstimateMarkup(s,t,2).includes('&lt;Jovan&gt;'));assert(!tradeEstimateMarkup(s,t,2).includes('untuk <Jovan>'));
});
