import test from 'node:test';import assert from 'node:assert/strict';
import {loadComponent,elements,textContent,jsxFixtureAvailable} from './helpers/tsx-fixture.mjs';
import {createGame,command} from '../lib/game.mjs';import {ingestTimeline,presentedState} from '../lib/presentation-timeline.mjs';
const file=name=>new URL(`../components/game/${name}.tsx`,import.meta.url);
const setup=()=>createGame({players:Array.from({length:6},(_,id)=>({name:'Player '+id})),startingRoll:false},()=>.2);
const options={skip:!jsxFixtureAvailable};
test('actual dice TSX hides result text/orientation during rolling and reveals the authoritative pair afterwards',options,async t=>{
 const f=await loadComponent(file('DiceRollFx'));t.after(f.dispose);
 const before=f.module.default({stage:'rolling',dice:[6,5],reduced:false,rollKey:'match:1'}),after=f.module.default({stage:'result',dice:[6,5],reduced:false,rollKey:'match:1'});
 assert.equal(before.props['aria-label'],'Dua dadu bergulir');assert(!textContent(before).includes('6 + 5'));assert(textContent(after).includes('6 + 5 = 11'));
 const cubes=elements(before).filter(n=>n.props.className?.startsWith('board-die board-die-'));assert.equal(cubes.length,2);assert(cubes.every(n=>n.props.style===undefined));assert.equal(elements(before).filter(n=>n.props.className?.startsWith('die-face die-face-')).length,12);
 assert.equal(f.module.default({stage:'hidden',dice:[6,5],reduced:false,rollKey:'match:1'}),null);
});
test('actual SVG artwork preserves group colour and renders separate owner, four houses, hotel and mortgage markers',options,async t=>{
 const f=await loadComponent(file('BoardMap'));t.after(f.dispose);const s=setup();s.assets[1]={owner:0,level:4,mortgaged:false};s.assets[3]={owner:1,level:5,mortgaged:false};s.assets[5]={owner:2,level:0,mortgaged:true};
 const all=elements(f.module.BoardArtwork({state:s,selected:3}));assert.equal(all.filter(n=>n.props['data-tile']!==undefined).length,40);
 assert.equal(all.filter(n=>n.props.className==='tile-ownership').length,3);assert.equal(all.filter(n=>n.props.className==='tile-development').length,2);assert.equal(all.filter(n=>n.props.className==='tile-mortgage').length,1);assert(all.some(n=>n.props.fill==='#9b5d45'||n.props.height==='23'));
 const tokens=elements(f.module.BoardTokens({state:s,jumping:null}));assert.equal(tokens.filter(n=>n.props['data-pawn']!==undefined).length,6);
});
test('actual capsule TSX shows signed confirmed debit/credit for the two humans without a fake bank player',options,async t=>{
 const f=await loadComponent(file('PlayerCapsules'));t.after(f.dispose);const s=setup(),transaction={id:'confirmed:1',kind:'rent',from:0,to:1,amount:1200};
 const all=elements(f.module.default({state:s,actor:0,transactions:[transaction],onSelect:()=>{}}));const effects=all.filter(n=>n.props.className?.includes('capsule-transaction'));assert.equal(effects.length,2);assert(effects.some(n=>n.props['aria-label']==='Keluar N 120'));assert(effects.some(n=>n.props['aria-label']==='Masuk N 120'));assert.equal(all.filter(n=>n.type==='button').length,6);
});
test('actual Game JSX receives masked board state, disables actions and preserves authoritative save binding',options,async t=>{
 const before=setup(),after=command(before,0,{type:'ROLL'},()=>.9),model=ingestTimeline(ingestTimeline(null,before),after),shown=presentedState(model);
 const f=await loadComponent(file('Game'),{states:{0:after,1:false},presentation:{state:shown,phase:'diceRolling',busy:true,dice:after.dice}});t.after(f.dispose);
 const tree=f.module.default(),all=elements(tree),board=all.find(n=>n.type?.displayName==='Board');assert(board);assert.equal(board.props.state.players[0].pos,before.players[0].pos);assert.deepEqual(board.props.state.dice,before.dice);assert(!textContent(tree).includes('6 + 6'));const dock=all.find(n=>n.type?.displayName==='MobileDock');assert(dock);assert.equal(dock.props.s,shown);assert(!('shown' in dock.props));
 const rollButtons=all.filter(n=>n.type==='button'&&textContent(n).includes('Lempar'));assert.equal(rollButtons.length,0);
});
test('actual save panel receives the latest authoritative snapshot during an unfinished visual transfer',options,async t=>{
 const before=setup();before.phase='buy';before.buy=1;const after=command(before,0,{type:'BUY'}),model=ingestTimeline(ingestTimeline(null,before),after);
 const f=await loadComponent(file('Game'),{states:{s:after,home:false,sheet:'saves'},presentation:{state:presentedState(model),phase:'financialSettlement',busy:true}});t.after(f.dispose);
 const panel=elements(f.module.default()).find(n=>n.type?.displayName==='SavePanel');assert(panel);assert.equal(panel.props.state,after);
});
test('public card JSX has one interactive ACK for its owner and read-only controls for observers',options,async t=>{
 let s=setup();const idx=s.decks.community.find(i=>i===1);s.decks.community=[idx,...s.decks.community.filter(i=>i!==idx)];s.players[0].pos=39;const cardState=command(s,0,{type:'ROLL'},(()=>{let i=0;return()=>[0,.2][i++]})());assert.equal(cardState.phase,'card');
 let model=ingestTimeline(ingestTimeline(null,s),cardState);while(!model.queue[0].event)model=(await import('../lib/presentation-timeline.mjs')).advanceTimeline(model,model.queue[0].id);
 const event=model.queue[0].event,shared={state:presentedState(model),phase:'eventRevealing',busy:true,event};let dismissed=0;
 const owner=await loadComponent(file('Game'),{states:{s:cardState,home:false},presentation:{...shared,canAcknowledge:true,dismissEvent:()=>dismissed++}});t.after(owner.dispose);
 const control=elements(owner.module.default()).find(n=>n.type==='button'&&textContent(n).includes('Jalankan kartu'));assert(control);await control.props.onClick();assert.equal(dismissed,1);assert.equal(cardState.phase,'card','React fixture does not mutate authoritative input');
 const viewer=await loadComponent(file('Game'),{states:{s:cardState,home:false,room:{code:'ABCDEFGH',seat:1,provider:'supabase'},connected:true,online:{status:'playing'}},presentation:{...shared,canAcknowledge:false}});t.after(viewer.dispose);
 assert(!elements(viewer.module.default()).some(n=>n.type==='button'&&textContent(n).includes('Jalankan kartu')));
});
test('actual expanded history presents both sides of a confirmed rent transfer from one stored ledger',options,async t=>{
 const s=setup(),event={id:3,type:'money',turn:1,text:'Sewa selesai',finance:[{kind:'rent',from:0,to:1,amount:1200,tile:3}]};
 const f=await loadComponent(file('HistoryPanel'),{states:{expanded:3}});t.after(f.dispose);
 const tree=f.module.default({events:[event],players:s.players}),texts=elements(tree).map(n=>n.props.text).filter(Boolean);assert(texts.some(x=>x.includes('membayar sewa')&&x.includes('− N 120')));assert(texts.some(x=>x.includes('menerima sewa')&&x.includes('+ N 120')));
});
test('actual local roll handler accepts only one command when double-clicked before React updates',options,async t=>{
 const game=setup(),f=await loadComponent(file('Game'),{states:{s:game,home:false}});t.after(f.dispose);
 const consoleProps=elements(f.module.default()).find(n=>n.type?.displayName==='MobileDock')?.props;assert(consoleProps);const dock=await loadComponent(file('MobileDock'));t.after(dock.dispose);const roll=elements(dock.module.default(consoleProps)).find(n=>n.type==='button'&&textContent(n).trim()==='Lempar dadu');assert(roll);
 await Promise.all([roll.props.onClick(),roll.props.onClick()]);const saved=f.updates.filter(u=>u.name==='s');assert.equal(saved.length,1);assert.equal(saved[0].value.version,game.version+1);assert.equal(game.version,0);
});
