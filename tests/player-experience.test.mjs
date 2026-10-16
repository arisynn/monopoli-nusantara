import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadComponent,elements,textContent,jsxFixtureAvailable} from './helpers/tsx-fixture.mjs';
import {createGame,command,publicState} from '../lib/game.mjs';
import {localPlayers} from '../lib/bot/personas.mjs';
import {playerSeat,lastPublicDice} from '../lib/player-experience.mjs';
import {ingestTimeline,advanceTimeline,presentedState} from '../lib/presentation-timeline.mjs';
const file=name=>new URL(`../components/game/${name}.tsx`,import.meta.url);
const options={skip:!jsxFixtureAvailable};
const setup=(n=4)=>createGame({players:localPlayers('Jovan',n,0),startingRoll:false},()=>.2);
async function render(t,name,props,states={},presentation){const f=await loadComponent(file(name),{states,presentation});t.after(f.dispose);return {...f,tree:f.module.default(props)};}
const component=(tree,name)=>elements(tree).find(e=>e.type?.displayName===name);
const button=(tree,label)=>elements(tree).find(e=>e.type==='button'&&(e.props['aria-label']===label||textContent(e).trim()===label));
const dockProps=s=>({s,actor:s.turn,human:true,busy:false,rolling:false,paused:false,act:()=>{},onDetails:()=>{},onResume:()=>{},onNew:()=>{}});

test('local feature identity stays human on a bot turn and online identity remains bound to its seat',()=>{
 const s=setup();s.turn=2;assert.equal(playerSeat(s),0);assert.equal(playerSeat(s,null,1),0);assert.equal(playerSeat(s,2,0),2);
 s.players[0].out=true;assert.equal(playerSeat(s),0);assert.equal(playerSeat(s,3),3);
});
test('settled dice history ignores private entries and malformed dice without deriving a result',()=>{
 const s=setup();s.log=[{id:9,audience:'private',dice:[6,6]},{id:8,dice:[0,9]},{id:7,audience:'public',dice:[2,5],diceKind:'utility'}];
 assert.deepEqual(lastPublicDice(s),{id:s.matchId+':7',dice:[2,5],kind:'utility'});assert.equal(lastPublicDice({...s,log:[]}),null);
});
test('game renders one board, one action console and no bottom navigation/sidebar',options,async t=>{
 const f=await render(t,'Game',undefined,{s:setup(),home:false}),all=elements(f.tree);
 assert(component(f.tree,'Board'));assert.equal(all.filter(e=>e.type?.displayName==='MobileDock').length,1);assert(component(f.tree,'TableActivity'));
 assert(all.some(e=>e.type==='main'&&e.props.className==='play-table'));
 assert(!all.some(e=>['game-tabs','game-sidebar','mobile-dock','nav-scrim'].some(c=>e.props.className?.split(' ').includes(c))));
 assert(!all.some(e=>e.type==='nav'));assert(button(f.tree,'Buka menu permainan'));assert(button(f.tree,'Buka barter'));
 assert(!('diceStage' in component(f.tree,'Board').props));
});
for(const feature of ['aset','barter','riwayat','saves','settings','rules','room'])test(`menu route ${feature} reaches the existing feature without issuing a game command`,options,async t=>{
 const s=setup(),room={seat:0,code:'ABCDEFGH',provider:'supabase'};
 const f=await render(t,'Game',undefined,{s,home:false,sheet:'menu',room,connected:true,online:{status:'playing'}});
 const menu=component(f.tree,'GameMenu');assert(menu);menu.props.onOpen(feature);
 assert(f.updates.some(u=>u.name===(['aset','barter','riwayat'].includes(feature)?'tab':'sheet')&&u.value===feature));
 assert(!f.updates.some(u=>u.name==='s'));assert.equal(s.version,0);
});
test('capsule opens selected portfolio while control remains on human seat',options,async t=>{
 const s=setup();s.turn=1;const f=await render(t,'Game',undefined,{s,home:false});component(f.tree,'PlayerCapsules').props.onSelect(2);
 assert(f.updates.some(u=>u.name==='assetPlayer'&&u.value===2));assert(f.updates.some(u=>u.name==='tab'&&u.value==='aset'));assert(!f.updates.some(u=>u.name==='localSeat'));
 const g=await render(t,'Game',undefined,{s,home:false,tab:'aset',assetPlayer:2});const assets=component(g.tree,'AssetManager');assert.equal(assets.props.ownerId,2);assert.equal(assets.props.controllerId,0);
});
for(const feature of ['aset','barter','riwayat'])test(`closing ${feature} returns to board and does not silently resume a paused game`,options,async t=>{
 const f=await render(t,'Game',undefined,{s:setup(),home:false,tab:feature,paused:true});button(f.tree,'Kembali ke papan').props.onClick();assert(f.updates.some(u=>u.name==='tab'&&u.value==='papan'));assert(!f.updates.some(u=>u.name==='paused'));
});
test('nested property close returns to its existing asset sheet',options,async t=>{
 const f=await render(t,'Game',undefined,{s:setup(),home:false,tab:'aset',sheet:'property',propertyReturn:'manage',selected:1});button(f.tree,'Kembali').props.onClick();assert(f.updates.some(u=>u.name==='sheet'&&u.value==='manage'));assert(!f.updates.some(u=>u.name==='tab'&&u.value==='papan'));
});
test('human trade draft stays attached to human identity during bot turn',options,async t=>{
 const s=setup();s.turn=2;const draft={to:1,give:[],take:[],giveCash:50,takeCash:0,giveCards:0,takeCards:0},key=s.matchId+'-0-offer';
 const f=await render(t,'Game',undefined,{s,home:false,tab:'barter',drafts:{[key]:draft}});const wizard=component(f.tree,'TradeWizard');assert.equal(wizard.props.from,0);assert.equal(wizard.props.trade,draft);
});
test('observers of an incoming trade have no enabled accept/reject or counteroffer action',options,async t=>{
 const s=setup();s.phase='trade';s.trade={from:0,to:1,give:[],take:[],giveCash:100,takeCash:0};
 const f=await render(t,'Game',undefined,{s,home:false,tab:'barter',room:{seat:2,provider:'supabase',code:'ABCDEFGH'},online:{status:'playing'},connected:true});
 for(const label of ['Tawar balik','Terima penawaran','Tolak penawaran']){const b=elements(f.tree).find(e=>e.type==='button'&&textContent(e).includes(label));assert(b);assert(b.props.disabled);}
});
for(const phase of ['diceRolling','diceResult','financialSettlement'])test(`${phase} console exposes no enabled action that commits gameplay`,options,async t=>{
 let actions=0;const s=setup(),props={...dockProps(s),act:()=>actions++,busy:true,presentationPhase:phase,diceStage:phase==='diceRolling'?'rolling':phase==='diceResult'?'result':'hidden',rolling:phase==='diceRolling',diceValues:[6,5]};
 const f=await render(t,'MobileDock',props);assert(elements(f.tree).filter(e=>e.props.className==='primary').every(e=>e.props.disabled));assert.equal(actions,0);assert(!textContent(f.tree).includes('6 + 5'));
});
test('movement progress keeps the console disabled until the pawn arrives',options,async t=>{
 const s=setup(),f=await render(t,'MobileDock',{...dockProps(s),traveling:{moveId:1,player:0,step:2,total:7}});
 const progress=elements(f.tree).find(e=>e.props.role==='progressbar');assert.equal(progress.props['aria-valuenow'],2);assert(elements(f.tree).filter(e=>e.type==='button').every(e=>e.props.disabled));
});
test('dice tray has no invented settled result on a fresh game',options,async t=>{
 const f=await render(t,'DiceTray',{stage:'hidden',dice:[1,1],rollKey:'',reduced:false});assert(!component(f.tree,'DiceRollFx'));assert(button(f.tree,'Siap melempar dua dadu')===undefined);assert(elements(f.tree).some(e=>e.props['aria-label']==='Siap melempar dua dadu'));
});
test('restored dice are static; current result, reduced motion and pause come only from presentation props',options,async t=>{
 const last={id:'saved:22',dice:[3,4],kind:'movement'};
 const f=await render(t,'DiceTray',{stage:'hidden',dice:[6,6],rollKey:'new',last,reduced:true,paused:true});const fx=component(f.tree,'DiceRollFx');assert.equal(fx.props.stage,'result');assert.deepEqual(fx.props.dice,[3,4]);assert.equal(fx.props.rollKey,'saved:22');assert(fx.props.reduced);assert(fx.props.paused);
 const g=await render(t,'DiceTray',{stage:'rolling',dice:[6,5],rollKey:'current',last,reduced:false});assert.equal(component(g.tree,'DiceRollFx').props.stage,'rolling');assert.equal(g.tree.props['data-dice-stage'],'rolling');
});
test('activity summary uses a public event and opens history without recomputing money',options,async t=>{
 let opened=0;const f=await render(t,'TableActivity',{events:[{id:2,audience:'private',text:'Hidden'},{id:1,audience:'public',text:'Sewa N 120'}],onOpen:()=>opened++});assert(!textContent(f.tree).includes('Hidden'));assert(textContent(f.tree).includes('120'));f.tree.props.onClick();assert.equal(opened,1);
});
test('menu retains every feature; online pause goes through Room rather than a local toggle',options,async t=>{
 let paused=0;const f=await render(t,'GameMenu',{online:true,paused:false,status:'Tersambung',onOpen:()=>{},onPause:()=>paused++,onHome:()=>{}});for(const label of ['Aset','Barter','Riwayat','Room','Simpanan','Pengaturan','Aturan'])assert(textContent(f.tree).includes(label));assert(!button(f.tree,'Jeda permainan'));assert.equal(paused,0);
});
test('compact paused room uses the same persisted readiness cycle and counts humans only',options,async t=>{
 const calls=[],room={provider:'supabase',state:{},seat:0,status:'paused',pause:{cycle:4,ready:[1],reason:'disconnect'},seats:[{id:0,name:'Jovan',controller:'human',connected:true},{id:1,name:'Ari',controller:'human',connected:true},{id:2,name:'Raka',controller:'bot',connected:true}]};
 const f=await render(t,'OnlineRoomStatus',{room,compact:true,onAction:(...args)=>calls.push(args)});assert(textContent(f.tree).includes('1/2 siap lanjut'));button(f.tree,'Siap lanjut').props.onClick();assert.deepEqual(calls,[['RESUME_READY',{cycle:4,ready:true}]]);
 const g=await render(t,'OnlineRoomStatus',{room:{...room,seats:room.seats.map(s=>s.id===0?{...s,connected:false}:s)},compact:true,onAction:()=>{}});assert(button(g.tree,'Siap lanjut').props.disabled);
});
for(const n of [2,4,6])test(`${n} client consoles share the same roll; duplicate/stale revisions and reconnect cannot roll it again`,options,async t=>{
 const s=createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i})),startingRoll:false},()=>.2),done=command(s,0,{type:'ROLL'},()=>.7);
 const models=Array.from({length:n},()=>ingestTimeline(ingestTimeline(null,publicState(s)),publicState(done)));
 for(let m of models){assert.equal(m.queue[0].kind,'diceRolling');assert.deepEqual(presentedState(m).dice,s.dice);assert.equal(ingestTimeline(m,publicState(done)),m);assert.equal(ingestTimeline(m,publicState(s)),m);m=advanceTimeline(m,m.queue[0].id);assert.equal(m.queue[0].kind,'diceResult');assert.deepEqual(presentedState(m).dice,done.dice);
 const baseline=ingestTimeline(m,publicState(done),{epoch:1});assert.equal(baseline.queue.length,0);const f=await render(t,'DiceTray',{stage:'hidden',dice:baseline.view.dice,rollKey:'',last:lastPublicDice(baseline.view),reduced:false});assert.equal(component(f.tree,'DiceRollFx').props.stage,'result');}
});
test('responsive source uses bounded viewport/grid, internal sheet scrolling and touch controls',()=>{
 const all=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8'),css=all.split('/* Player Experience 4.6.1')[1];assert(css);assert(all.includes('.is-playing:not(.player-experience) .players-strip'));assert(!all.includes('.is-playing .players-strip{grid-column:2;grid-row:1;grid-template-columns:repeat(2,minmax(0,1fr))!important}'));assert(css.includes('grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:40px')); assert(css.includes('height:var(--game-height,100dvh)'));assert(css.includes('grid-template-rows:auto minmax(0,1fr) auto'));assert(css.includes('@media(max-width:359px)'));assert(css.includes('safe-area-inset-bottom'));assert(css.includes('overflow-y:auto'));assert(css.includes('min-height:44px'));assert(css.includes('@media(prefers-reduced-motion:reduce)'));
});

test('feature sheets suspend the local animation renderer while the authoritative state stays bound to saves',options,async t=>{
 const s=setup(),f=await render(t,'Game',undefined,{s,home:false,tab:'riwayat'});assert(component(f.tree,'Board').props.animationPaused);assert(component(f.tree,'MobileDock').props.animationPaused);assert.equal(component(f.tree,'HistoryPanel').props.events,s.log);
});
test('bot portfolio remains read only in the actual AssetManager component',options,async t=>{
 const s=setup();s.assets[1].owner=1;s.assets[3].owner=1;
 const f=await render(t,'AssetManager',{game:s,ownerId:1,controllerId:0,busy:false,onOwnerChange:()=>{},onOpen:()=>{},onAction:()=>{throw Error('Bot assets are read-only')},onAllTiles:()=>{}});
 assert(textContent(f.tree).includes('hanya lihat'));assert(!elements(f.tree).some(e=>e.props.className==='asset-simple-action'));
});
test('save-and-home cannot claim success when both local persistence backends fail',options,async t=>{
 const f=await render(t,'Game',undefined,{s:setup(),home:false,sheet:'menu'});await component(f.tree,'GameMenu').props.onHome();assert(!f.updates.some(u=>u.name==='home'&&u.value===true));assert(f.updates.some(u=>u.name==='err'&&u.value.includes('Simpanan belum berhasil')));
});

test('Room sheet renders one voting panel rather than duplicate action controls',options,async t=>{
 const s=setup(),f=await render(t,'Game',undefined,{s,home:false,sheet:'room',room:{seat:0,code:'ABCDEFGH',provider:'supabase'},connected:true,online:{status:'playing',vote:{status:'open'},seats:[]}});
 // One compact board banner is inert behind the dialog; only one full panel is interactive.
 assert.equal(elements(f.tree).filter(e=>e.type?.displayName==='OnlineRoomStatus'&&!e.props.compact).length,1);
});
