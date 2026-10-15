import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,command,publicState} from '../lib/game.mjs';
import {boundedAmount,changeTradeOpponent,toggleSelection,filterChoices,tradeChoices,tradeDraftStatus} from '../lib/compact-ui.mjs';
import {createLayerNavigation} from '../lib/layer-navigation.mjs';
const game=()=>createGame({players:[{name:'A'},{name:'B'},{name:'C'}],startingRoll:false},()=>.3);
const draft=()=>({to:1,give:[1],take:[6],giveCash:100,takeCash:0,giveCards:0,takeCards:0});
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('search and selected-only filtering preserve all picks across temporary views',()=>{
 const items=[{id:1,label:'Jakarta',detail:'Digadai'},{id:3,label:'Bali'},{id:6,label:'Medan'}];
 const selected=toggleSelection(toggleSelection([],1),6);
 assert.deepEqual(filterChoices(items,'  JAKARTA '),[items[0]]);
 assert.deepEqual(filterChoices(items,'digadai'),[items[0]]);
 assert.deepEqual(filterChoices(items,'',true,selected),[items[0],items[2]]);
 assert.deepEqual(selected,[1,6]);assert.deepEqual(toggleSelection(selected,1),[6]);
 assert.deepEqual(toggleSelection(selected,3,false),[3]);
});
test('switching recipient preserves given assets and clears only the requested side',()=>{
 const before=draft(),after=changeTradeOpponent(before,2);
 assert.deepEqual(after,{...before,to:2,take:[],takeCash:0,takeCards:0});
 assert.equal(changeTradeOpponent(before,1),before);
 assert.deepEqual(before.take,[6]);
});
test('property selector blocks developed groups and lets stale selected assets be removed',()=>{
 const s=game();s.assets[1].owner=0;s.assets[3].owner=0;s.assets[1].level=1;
 const rows=tradeChoices(s,0,[3]);
 assert.equal(rows.find(r=>r.id===1).disabled,true);
 assert.equal(rows.find(r=>r.id===3).disabled,false);
 s.assets[3].owner=1;
 const stale=tradeChoices(s,0,[3]).find(r=>r.id===3);
 assert.match(stale.detail,/Pemilik berubah/);assert.equal(stale.disabled,false);
 assert.equal(tradeDraftStatus(s,0,{...draft(),give:[3]}).invalid,true);
});
test('compact composer submits the existing atomic trade and supports mortgages/cards/counter',()=>{
 const s=game();s.assets[1].owner=0;s.assets[1].mortgaged=true;s.assets[6].owner=1;
 s.players[0].cards=[{deck:'chance',idx:8}];
 const trade={...draft(),giveCards:1};
 assert.deepEqual(tradeDraftStatus(s,0,trade),{hasValue:true,invalid:false,reason:''});
 const offered=command(s,0,{type:'OFFER',trade});
 const counter={to:0,give:[6],take:[1],giveCash:0,takeCash:50,giveCards:0,takeCards:1};
 assert.equal(tradeDraftStatus(publicState(offered),1,counter).invalid,false);
 const accepted=command(command(offered,1,{type:'COUNTER',trade:counter}),0,{type:'TRADE_ACCEPT',id:'once'});
 assert.equal(accepted.assets[1].owner,1);assert.equal(accepted.players[1].cards.length,1);
 assert.equal(accepted.phase,'mortgage');assert.equal(command(accepted,0,{type:'TRADE_ACCEPT',id:'once'}),accepted);
});
test('empty/invalid drafts cannot become eligible even after ownership or cash changes',()=>{
 const s=game(),empty={to:1,give:[],take:[],giveCash:0,takeCash:0,giveCards:0,takeCards:0};
 assert.equal(tradeDraftStatus(s,0,empty).hasValue,false);
 s.assets[1].owner=0;s.assets[6].owner=1;
 for(const patch of [{take:[1]},{giveCash:15001},{giveCash:-1},{giveCash:1.5},{giveCards:1},{to:0}])assert.equal(tradeDraftStatus(s,0,{...draft(),...patch}).invalid,true);
 s.players[1].out=true;assert.equal(tradeDraftStatus(s,0,draft()).invalid,true);
});
test('cash inputs preserve Rp1 precision while bounding to real cash',()=>{
 for(const [value,expected] of [['',0],['-4',0],['1',1],['13.8',13],['200',100],['abc',0]])assert.equal(boundedAmount(value,100),expected);
});
function navigation(){
 const tasks=[],stack=[{app:'original'}];let index=0,backCount=0,calls=0,controller;
 const history={get state(){return stack[index]},pushState(state){stack.splice(++index);stack[index]=state},back(){backCount++;if(index){index--;tasks.push(()=>controller.pop())}}};
 const flush=()=>{let count=0;while(tasks.length){assert(++count<50,'navigation loop');tasks.shift()()}};
 controller=createLayerNavigation(history,()=>{calls++},fn=>tasks.push(fn));
 return {controller,history,flush,back:()=>{history.back();flush()},calls:()=>calls,backCount:()=>backCount,depth:()=>index};
}
test('Android Back closes only the top view, then rearms for its underlying panel',()=>{
 const n=navigation();n.controller.sync(true);assert.equal(n.depth(),1);
 n.back();assert.equal(n.calls(),1);assert.equal(n.depth(),1); // selector -> composer, still active
 n.back();assert.equal(n.calls(),2);
 n.controller.sync(false);n.flush();assert.equal(n.depth(),0);
 assert.equal(n.history.state.app,'original');
});
test('button/automatic dismissal removes the transient entry without invoking Back twice',()=>{
 const n=navigation();n.controller.sync(true);n.controller.sync(true);
 assert.equal(n.depth(),1);
 n.controller.sync(false);n.flush();assert.equal(n.calls(),0);assert.equal(n.depth(),0);
 n.controller.sync(true);n.controller.sync(false);n.controller.sync(true);n.flush();
 assert.equal(n.depth(),1);assert.equal(n.calls(),0);
 n.controller.dispose();n.flush();assert.equal(n.depth(),0);
});
test('UI wiring uses one shared selection surface and preserves v2.8 decision presentation',()=>{
 const game=read('../components/game/Game.tsx'),wizard=read('../components/game/TradeWizard.tsx'),selector=read('../components/game/SelectionView.tsx');
 assert(game.includes("displaySheet==='selector'&&picker?<SelectionView"));
 assert(game.includes('<TradeWizard onPick={openSelector}'));
 assert(game.includes('useLayerBack('));assert(game.includes('picker.returnSheet'));
 assert(game.includes('selectGameplayPopup('));assert(game.includes('onAction={requestAssetAction}'));
 assert(!wizard.includes('trade-steps'));assert(!wizard.includes('trade-property-list'));
 assert(wizard.includes('submitting.current'));assert(wizard.includes('mode===\'counter\''));
 assert(!selector.includes('aria-modal'));assert(!selector.includes('modal-backdrop'));
});

test('ordinary turn notices stay plain, short and expire without creating a decision',async()=>{
 const {summarizeNotices}=await import('../lib/quick-notice.mjs');
 const {collectPresentation,presentationCursor,gameplayDecision,selectGameplayPopup}=await import('../lib/gameplay-presentation.mjs');
 const s=game();s.phase='end';
 const next=command(s,0,{type:'END'}),batch=collectPresentation(presentationCursor(s),next);
 const notice=summarizeNotices(batch.notices);
 assert.equal(notice.text,'Giliran B.');assert.equal(notice.kind,'turn');assert.equal(notice.duration,2000);assert.equal(notice.detail,false);
 assert.equal(gameplayDecision(next),null);assert.equal(selectGameplayPopup({ready:true,event:batch.events[0]}),null);
 assert.equal(next.phase,'roll');assert.equal(next.turn,1);
 assert.equal(summarizeNotices([{id:1,type:'turn',text:'Giliran A.'},{id:2,type:'turn',text:'Giliran B.'}]).text,'Giliran B.');
});
test('large transaction feedback is summarized while History retains complete engine text',async()=>{
 const {summarizeNotices}=await import('../lib/quick-notice.mjs');
 const log=[{id:3,type:'trade',text:'Barter selesai: '+Array.from({length:28},(_,i)=>`Properti ${i}`).join(', ')}];
 const original=structuredClone(log),notice=summarizeNotices(log);
 assert.equal(notice.text,'Barter selesai.');assert.equal(notice.detail,true);assert.equal(notice.duration,3200);
 assert.deepEqual(log,original);assert.equal(summarizeNotices([]),null);
});
test('rent notifications preserve payer/payee/amount and omit redundant turn text',async()=>{
 const {summarizeNotices}=await import('../lib/quick-notice.mjs');
 const notice=summarizeNotices([{id:3,type:'money',text:'A membayar Rp400 kepada B · sewa Bali.'},{id:4,type:'turn',text:'Giliran B.'}]);
 assert.equal(notice.text,'A membayar Rp400 kepada B · sewa Bali.');assert.equal(notice.detail,false);
});
test('notification layout explicitly prevents the former top/bottom stretching conflict',()=>{
 const css=read('../app/globals.css');
 const rule=css.match(/\.app \.game-notice\{([^}]+)\}/)[1];
 const props=Object.fromEntries(rule.split(';').filter(Boolean).map(declaration=>{const i=declaration.indexOf(':');return [declaration.slice(0,i),declaration.slice(i+1)]}));
 assert.equal(props.bottom,'auto');assert.equal(props.height,'auto');assert.equal(props['min-height'],'44px');assert.equal(props['max-height'],'56px');
 assert.equal(props.width,'max-content');assert.equal(props['flex-direction'],'row');assert.equal(props.flex,'0 0 auto');assert.equal(props['pointer-events'],'none');
 assert(!css.includes('bottom:calc(170px + env(safe-area-inset-bottom,0px))'));
});
test('all game feedback uses a distinct notification component instead of modal or legacy toast sizing',()=>{
 const component=read('../components/game/GameNotice.tsx'),game=read('../components/game/Game.tsx');
 assert(component.includes('game-notice notice-'));assert(component.includes("'alert':'status'"));
 assert(!component.includes('modal-backdrop'));assert(!component.includes('aria-modal'));
 assert(!game.includes('className="toast gameplay-toast"'));assert(!game.includes('className="error-toast"'));assert(!game.includes('className="connection-banner"'));
 assert(game.includes('handoff-prompt'));assert(!game.includes('className="giant-pawn"'));
});
