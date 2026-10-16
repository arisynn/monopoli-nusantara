import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,DECKS,publicState,decisionActor,chooseBot} from '../lib/game.mjs';
import {gameplayDecision,canPresentDecision,presentationCursor,collectPresentation,selectGameplayPopup,cardImpact,bankruptcyShortfall} from '../lib/gameplay-presentation.mjs';
import {pawnRoute} from '../lib/pawn-animation.mjs';
import {validateLocalState} from '../lib/save-format.mjs';
const setup=(rules='digital')=>createGame({players:[{name:'A'},{name:'B'},{name:'C',controller:'bot'}],startingRoll:false,rules},()=>.3);
const roll=(a,b)=>{const list=[a,b];return ()=>((list.shift()-.5)/6)};
const trade={to:1,give:[1],take:[6],giveCash:100,takeCash:0,giveCards:0,takeCards:0};

test('purchase popup is reconstructed from save and limited to its human actor',()=>{
 let s=command(setup(),0,{type:'ROLL'},roll(1,2));
 assert.equal(s.phase,'buy');const d=gameplayDecision(s);
 assert.equal(canPresentDecision(s,0),true);assert.equal(canPresentDecision(s,1),false);
 s=validateLocalState(JSON.parse(JSON.stringify(s)));assert.deepEqual(gameplayDecision(s),d);
 const view=publicState(s);assert.deepEqual(gameplayDecision(view),d);
 const popup=selectGameplayPopup({ready:true,eligible:true,decision:d});assert.equal(popup,'turn');
});
test('navigation and queued events never remove a pending decision',()=>{
 const s=setup();s.phase='debt';s.debt={from:0,to:1,amount:20000,label:'sewa'};
 const d=gameplayDecision(s),args={ready:true,eligible:true,decision:d,event:{id:'jail'}};
 assert.equal(selectGameplayPopup(args),'turn');
 assert.equal(selectGameplayPopup({...args,menu:'manage'}),'manage');
 assert.equal(selectGameplayPopup({...args,menu:'counter'}),'counter');
 assert.equal(selectGameplayPopup({...args,dismissed:d.key,event:null}),null);
 assert.equal(gameplayDecision(s).key,d.key);assert.equal(s.debt.amount,20000);
 assert.equal(selectGameplayPopup({...args,handoff:true}),null);
 for(const ready of [false])assert.equal(selectGameplayPopup({...args,ready}),null);
});
test('rent auto pays once and produces payee/amount feedback after movement',()=>{
 const before=setup();before.assets[3].owner=1;
 const s=command(before,0,{type:'ROLL',id:'roll-one'},roll(1,2));
 assert.equal(s.players[0].cash,14960);assert.equal(s.players[1].cash,15040);
 const batch=collectPresentation(presentationCursor(before),s);
 assert(batch.notices.some(e=>e.text.includes('Rp40')&&e.text.includes('B')));
 assert.equal(selectGameplayPopup({ready:false,event:batch.events[0]}),null);
 assert.equal(command(s,0,{type:'ROLL',id:'roll-one'}),s);
 assert.equal(collectPresentation(batch.cursor,s).notices.length,0);
});
test('manual rent stays unprocessed until claimed; repeat claim cannot transfer twice',()=>{
 const before=setup('classic');before.assets[3].owner=1;
 const landed=command(before,0,{type:'ROLL'},roll(1,2));
 assert.equal(landed.players[0].cash,15000);assert.equal(landed.rentClaims.length,1);
 assert.equal(collectPresentation(presentationCursor(before),landed).notices.some(e=>e.type==='money'),false);
 const claim=landed.rentClaims[0],paid=command(landed,1,{type:'CLAIM_RENT',claimId:claim.id,id:'rent'});
 assert.equal(command(paid,1,{type:'CLAIM_RENT',claimId:claim.id,id:'rent'}),paid);
 assert.throws(()=>command(paid,1,{type:'CLAIM_RENT',claimId:claim.id}),/Klaim/);
 assert.equal(paid.players[1].cash,15040);
});
test('all movement cards execute once, preserve engine destinations, and expose real routes',()=>{
 for(const deck of Object.keys(DECKS))for(const [idx,card] of DECKS[deck].entries()){
  if(!(card.move!==undefined||card.back||card.nearest))continue;
  const before=setup();before.players[0].pos=deck==='chance'?36:33;
  before.phase='card';before.card={...card,deck,idx,player:0};
  assert.match(cardImpact(before),/Bergerak|Mundur/);
  const s=command(before,0,{type:'ACK',id:'card'},()=>.3);
  assert.equal(command(s,0,{type:'ACK',id:'card'}),s);
  if(!s.lastMove?.jump)assert(pawnRoute(s.lastMove).length>1);
  if(s.phase==='buy')assert.equal(s.buy,s.players[0].pos);
 }
});
test('go-to-jail keeps approach to tile 30 without a fake walking route to tile 10',()=>{
 const before=setup();before.players[0].pos=27;
 const s=command(before,0,{type:'ROLL'},roll(1,2));
 assert.equal(s.players[0].pos,10);assert.equal(s.players[0].inJail,true);
 assert.deepEqual(s.lastMove.approach.path,[28,29,30]);
 assert.equal(pawnRoute(s.lastMove).length,4);
 assert.equal(s.players[0].cash,15000);
 assert.equal('_moveStart' in s,false);
 assert.doesNotThrow(()=>validateLocalState(s));
 assert.equal(collectPresentation(presentationCursor(before),s).events[0].type,'jail');
});
test('three doubles jail has no approach from the previous turn',()=>{
 let s=command(setup(),0,{type:'ROLL'},roll(1,1));
 s=command(s,0,{type:'ACK'}); // resolve community card
 // Choose an explicit valid roll context, preserving previous movement metadata.
 s.phase='roll';s.doubles=2;
 s=command(s,0,{type:'ROLL'},roll(3,3));
 assert.equal(s.lastMove.jump,true);assert.equal(s.lastMove.approach,undefined);
 assert.deepEqual(pawnRoute(s.lastMove),[]);
});
test('reconnect/restore baseline skips history but preserves debt and trade decisions',()=>{
 const before=setup();before.phase='debt';before.debt={from:0,to:null,amount:20000,label:'Pajak'};
 const after=structuredClone(before);after.version=10;after.eventId=10;
 after.log.unshift({id:10,text:'A masuk penjara.',type:'jail',turn:1});
 const result=collectPresentation(presentationCursor(before),after,{baseline:true});
 assert.deepEqual(result.events,[]);assert.deepEqual(result.notices,[]);
 assert.equal(gameplayDecision(after).phase,'debt');
 assert.equal(collectPresentation(result.cursor,after).events.length,0);
});
test('trade and counter are atomic, authorize recipient, and keep stable live popup identity',()=>{
 const s=setup();s.assets[1].owner=0;s.assets[6].owner=1;
 const offered=command(s,0,{type:'OFFER',trade});
 const first=gameplayDecision(offered);
 assert.equal(canPresentDecision(offered,1),true);assert.equal(canPresentDecision(offered,0),false);
 const counter=command(offered,1,{type:'COUNTER',trade:{...trade,to:0,give:[6],take:[1],giveCash:0,takeCash:150}});
 assert.notEqual(gameplayDecision(counter).key,first.key);
 const after=command(counter,0,{type:'TRADE_ACCEPT',id:'accept'});
 assert.equal(after.players[0].cash,14850);assert.equal(after.assets[1].owner,1);
 assert.equal(command(after,0,{type:'TRADE_ACCEPT',id:'accept'}),after);
 assert(collectPresentation(presentationCursor(counter),after).notices.some(e=>e.text.includes('Barter selesai')));
});
test('debt survives asset actions and trade; END cannot bypass it',()=>{
 const s=setup();s.assets[1].owner=0;s.players[0].cash=0;
 s.phase='debt';s.debt={from:0,to:null,amount:500,label:'Pajak'};
 const d=gameplayDecision(s);assert.throws(()=>command(s,0,{type:'END'}));
 const offered=command(s,0,{type:'OFFER',trade:{...trade,take:[],giveCash:0,takeCash:600}});
 const after=command(offered,1,{type:'TRADE_ACCEPT'});
 assert.equal(gameplayDecision(after).key,d.key);assert.equal(after.debt.amount,500);
 const paid=command(after,0,{type:'PAY',id:'pay'});
 assert.equal(paid.players[0].cash,100);assert.equal(command(paid,0,{type:'PAY',id:'pay'}),paid);
});
test('auction amount updates do not reopen a minimized popup; other human participants can act',()=>{
 const s=setup();s.phase='buy';s.buy=1;
 const auction=command(s,0,{type:'AUCTION'}),key=gameplayDecision(auction).key;
 const bid=command(auction,1,{type:'BID',amount:100});
 assert.equal(gameplayDecision(bid).key,key);assert.equal(canPresentDecision(bid,1),true);
 assert.equal(canPresentDecision(bid,2),false);
});
test('bankruptcy offered only below real liquidation value and only engine logs trigger its event',()=>{
 const s=setup();s.phase='debt';s.debt={from:0,to:null,amount:20000,label:'Pajak'};
 assert.equal(bankruptcyShortfall(s,0),5000);
 const after=command(s,0,{type:'BANKRUPT'});
 assert(collectPresentation(presentationCursor(s),after).events.some(e=>e.type==='bankrupt'));
 s.players[0].cash=20000;assert.equal(bankruptcyShortfall(s,0),0);
 assert.throws(()=>command(s,0,{type:'BANKRUPT'}),/Aset masih cukup/);
});
test('jail release feedback is present once and bots do not depend on the presentation queue',()=>{
 const s=setup();s.phase='jail';s.players[0].pos=10;s.players[0].inJail=true;
 const after=command(s,0,{type:'JAIL_PAY'});
 const events=collectPresentation(presentationCursor(s),after);
 assert.equal(events.events[0].type,'release');
 assert.equal(collectPresentation(events.cursor,after).events.length,0);
 s.players[0].controller='bot';assert.equal(canPresentDecision(s),false);
 assert(chooseBot(s,decisionActor(s)));
});
test('older snapshots, rerenders, match changes, and trimmed logs never replay effects',()=>{
 const s=setup(),cursor=presentationCursor(s);
 const next=command(s,0,{type:'ROLL'},roll(1,2));
 const events=collectPresentation(cursor,next);
 assert.equal(collectPresentation(events.cursor,next).events.length,0);
 assert.equal(collectPresentation(events.cursor,s).cursor,events.cursor);
 const other=setup();assert.equal(collectPresentation(events.cursor,other).notices.length,0);
 next.eventId+=1000;next.version++;next.log=[{id:next.eventId,type:'money',turn:1,text:'Terima Rp100'}];
 assert.equal(collectPresentation(events.cursor,next).notices.length,1);
});
