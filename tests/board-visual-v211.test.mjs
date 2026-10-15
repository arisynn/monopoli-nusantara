import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {TOKENS,pawnFor,assignPawns,availablePawn,selectPawn,setSeatPawn} from '../lib/pawns.mjs';
import {pawnSlot,pawnPlacement,pawnPoint} from '../lib/pawn-layout.mjs';
import {tileRect,tileCenter,hitTile} from '../lib/board-camera.mjs';
import {pawnRoute,samplePawnRoute,pawnMotionScale} from '../lib/pawn-animation.mjs';
import {createGame,command,publicState} from '../lib/game.mjs';
import {validateLocalState,serializeSave,parseSave} from '../lib/save-format.mjs';
import {money} from '../lib/currency.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const players=n=>Array.from({length:n},(_,id)=>({id,name:`Pemain ${id+1}`,pawn:id}));

test('six original pawn files are distinct, local and lightweight',()=>{
 assert.equal(TOKENS.length,6);assert.equal(new Set(TOKENS.map(p=>p.name)).size,6);
 const source=TOKENS.map(p=>{const file=new URL('../public'+p.src,import.meta.url),s=readFileSync(file,'utf8');assert(s.includes('<svg'));assert(s.includes('<title>'));assert(!/<script|<image|onload|https?:\/\//.test(s.replace('http://www.w3.org/2000/svg','')));assert(statSync(file).size<4000);return s});
 assert.equal(new Set(source).size,6);assert.equal(pawnFor({id:5}),5);assert.equal(pawnFor({id:2,pawn:-100}),2);assert.equal(pawnFor({id:0,pawn:4}),4);
});
test('one pawn of every seat is exactly centered on all forty tiles',()=>{
 for(let tile=0;tile<40;tile++)for(let id=0;id<6;id++){
  const state={players:players(6).map(p=>({...p,pos:p.id===id?tile:(tile+1)%40,out:false}))};
  assert.deepEqual(pawnPoint(state,id),tileCenter(tile));assert.equal(pawnPlacement(state,id).size,38);
 }
});
test('two to six pieces form symmetric non-overlapping bounded clusters in every orientation',()=>{
 for(let tile=0;tile<40;tile++)for(let n=2;n<=6;n++){
  const c=tileCenter(tile),r=tileRect(tile),points=players(n).map(p=>pawnSlot(tile,p.id,n));
  near(points.reduce((sum,p)=>sum+p.x,0)/n,c.x);near(points.reduce((sum,p)=>sum+p.y,0)/n,c.y);
  for(const p of points){assert.equal(hitTile(p),tile);const radius=p.size/2+2;assert(p.x-radius>=r.x&&p.x+radius<=r.x+r.width&&p.y-radius>=r.y&&p.y+radius<=r.y+r.height)}
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)assert(Math.abs(points[i].x-points[j].x)>=points[i].size||Math.abs(points[i].y-points[j].y)>=points[i].size,'piece footprints must not overlap');
 }
});
test('bankrupt players do not occupy a cluster and ordering is stable across snapshots',()=>{
 const state={players:players(6).map(p=>({...p,pos:12,out:p.id!==3}))};assert.deepEqual(pawnPoint(state,3),tileCenter(12));
 state.players.forEach(p=>p.out=false);const before=state.players.map(p=>pawnPlacement(state,p.id));
 assert.deepEqual(before,structuredClone(state).players.map(p=>pawnPlacement(state,p.id)));
 const reversed={players:[...state.players].reverse()};assert.deepEqual(before,players(6).map(p=>pawnPlacement(reversed,p.id)));
});
test('local selection swaps occupied identities and retains choices when a picker closes',()=>{
 const choices=[0,1,2,3,4,5],next=selectPawn(choices,0,4);assert.deepEqual(next,[4,1,2,3,0,5]);assert.deepEqual(choices,[0,1,2,3,4,5]);assert.equal(new Set(next).size,6);
 assert.equal(selectPawn(choices,0,99),choices);assert.equal(selectPawn(choices,-1,2),choices);
 assert.deepEqual(assignPawns([{pawn:4},{pawn:4},{pawn:2},{pawn:'3'},{pawn:99},{}]),[4,0,2,1,3,5]);
 assert.deepEqual(assignPawns([{}, {pawn:0}]),[1,0]);
});
test('lobby assignment is exclusive, authenticated seat scoped and preserves readiness',()=>{
 const seats=[{name:'A',pawn:4,ready:true,token:'secret'},{name:'B',pawn:1,ready:false,token:'secret2'}];
 assert.equal(availablePawn(seats,4),0);assert.equal(availablePawn(seats,5),5);
 const changed=setSeatPawn(seats,1,3);assert.equal(changed[1].pawn,3);assert.equal(changed[0].pawn,4);assert.equal(changed[1].ready,false);assert.equal(changed[1].token,'secret2');
 assert.equal(seats[1].pawn,1);assert.throws(()=>setSeatPawn(seats,1,4),/sudah dipilih/);assert.throws(()=>setSeatPawn(seats,1,3.2),/tidak valid/);assert.throws(()=>setSeatPawn(seats,8,3),/tidak valid/);
 const old=[{name:'A'},{name:'B'}];assert.deepEqual(setSeatPawn(old,0,4).map(p=>p.pawn),[4,1]);assert.deepEqual(assignPawns([...old,{pawn:availablePawn(old,0)}]),[0,1,2]);
});
test('selected pawns persist in public snapshots and local saves without economic conversion',()=>{
 const s=createGame({players:players(6).map((p,i)=>({...p,pawn:5-i})),startingRoll:false},()=>.2);
 assert.deepEqual(s.players.map(p=>p.pawn),[5,4,3,2,1,0]);assert.deepEqual(publicState(s).players.map(p=>p.pawn),[5,4,3,2,1,0]);
 assert.deepEqual(parseSave(serializeSave({state:s})).state,s);assert(s.players.every(p=>p.cash===15000));assert.equal(money(15000),'N 1.500');
 const old=structuredClone(s);old.players.forEach(p=>delete p.pawn);assert.deepEqual(validateLocalState(old),old);
 const corrupt=structuredClone(s);corrupt.players[0].pawn=100;assert.throws(()=>validateLocalState(corrupt),/tidak valid/);
});
test('movement begins in the former cluster and ends at the actual occupied destination',()=>{
 let s=createGame({players:players(6),startingRoll:false},()=>.2);s.players[1].pos=3;
 const before=pawnPoint(s,0);let draws=[.01,.2];s=command(s,0,{type:'ROLL'},()=>draws.shift());
 assert.deepEqual(s.lastMove.path,[1,2,3]);const points=pawnRoute(s.lastMove,s);assert.deepEqual(points[0],before);assert.deepEqual(points.at(-1),pawnPoint(s,0));
 assert.equal(pawnMotionScale(s.lastMove,s,0),19/32);assert.equal(pawnMotionScale(s.lastMove,s,1),38/32);assert.equal(pawnMotionScale(s.lastMove,s,3),1);
 assert.deepEqual(points[1],tileCenter(1));assert.deepEqual(points[2],tileCenter(2));assert.equal(samplePawnRoute(points,675,225).done,true);
});
test('backward, START crossing, card moves and jail approach retain authoritative routes',()=>{
 const s={players:players(3).map(p=>({...p,pos:p.id===0?39:10,out:false}))};
 const move={player:0,from:1,path:[0,39]};const points=pawnRoute(move,s);assert.deepEqual(points[1],tileCenter(0));assert.deepEqual(points.at(-1),pawnPoint(s,0));
 assert.deepEqual(pawnRoute({player:0,from:7,path:[10],jump:true},s),[]);
 s.players[0].pos=10;const jail={player:0,from:28,path:[10],jump:true,approach:{player:0,from:28,path:[29,30]}};
 const route=pawnRoute(jail,s);assert.equal(hitTile(route[0]),28);assert.equal(hitTile(route.at(-1)),30);assert.equal(hitTile(pawnPoint(s,0)),10);
 assert.deepEqual(s.players.map(p=>p.pos),[10,10,10]);
});
test('new deck and special tile illustrations exist; retired card atlas has no runtime references',()=>{
 assert(!existsSync(new URL('../public/assets/card-atlas.webp',import.meta.url)));
 for(const name of ['chance','community','start','jail','gojail','parking','station','electric','water','tax'])assert(read(`public/assets/board/${name}.svg`).includes('<svg'));
 for(const file of ['components/game/BoardMap.tsx','components/game/AssetArt.tsx','app/globals.css','public/sw.js'])assert(!read(file).includes('card-atlas'));
 assert(read('components/game/EventCard.tsx').includes('<CardArt deck={card.deck}/>'));assert(read('components/game/Game.tsx').includes('<EventCard card={s.card}'));
});
test('currency symbol remains a scoped visual glyph with literal N text fallback',()=>{
 const font=readFileSync(new URL('../public/assets/nusa-symbol.woff',import.meta.url));assert.equal(font.subarray(0,4).toString(),'wOFF');assert(font.length<2000);
 const css=read('app/globals.css'),component=read('components/game/NusaText.tsx');assert(css.includes('unicode-range:U+004E'));assert(css.includes("font-display:swap"));assert(component.includes('aria-label="Nusa">N</span>'));
 assert(read('components/game/BoardMap.tsx').includes('<SvgNusaText'));assert(read('components/game/PlayerCapsules.tsx').includes('<NusaText'));assert(read('components/game/HistoryPanel.tsx').includes('<NusaText'));
});
test('setup and lobby use one picker view and existing revision-guarded room writes',()=>{
 const game=read('components/game/Game.tsx'),api=read('app/api/game/route.ts');assert(game.includes("displaySheet==='pawn'?<PawnPicker"));assert(game.includes('pawn:pawnChoices[i]'));assert(game.includes('pawnChoices[0]'));assert(game.includes('selectPawn(old,pawnSeat,id)'));
 const picker=read('components/game/PawnPicker.tsx');assert(!picker.includes('modal-backdrop'));assert(!picker.includes('aria-modal'));assert(picker.includes('aria-pressed'));
 assert(api.indexOf('const seat=await seatFor')<api.indexOf("if(type==='READY')"));assert(api.includes("check(!room.state,'Pertandingan sudah dimulai.');if(Object.hasOwn(body,'pawn'))room.seats=setSeatPawn(room.seats,seat,body.pawn)"));assert(api.includes('await commit(store,row,room)'));
 const board=read('components/game/Board.tsx');assert(board.includes('pawnRoute(m,s)'));assert(board.includes('positionPawn(animation.player,currentPoint,currentScale)'));assert(!board.includes('tokenPoint(p.pos'));
});

test('room API keeps pawn selection exclusive through CAS, reconnect and START',async t=>{
 // Execute the actual route after Node strips TypeScript; only hosting/Groq adapters are stubbed.
 const {stripTypeScriptTypes}=await import('node:module');const rooms=new Map();
 const store={quota:async()=>1,create:async room=>{if(rooms.has(room.code))return false;rooms.set(room.code,{data:JSON.stringify(room),revision:0});return true},get:async code=>{const row=rooms.get(code);return row?{...row,code}:null},commit:async(row,room)=>{const current=rooms.get(row.code);if(current.revision!==row.revision)return false;rooms.set(row.code,{data:JSON.stringify(room),revision:current.revision+1});return true}};
 const runtimeKey='__nusantara211TestRuntime';globalThis[runtimeKey]={store,env:{},hosting:'test',creatorId:()=> 'tester'};t.after(()=>delete globalThis[runtimeKey]);
 let source=read('app/api/game/route.ts');source=source.replace(/^import .*?;$/gm,line=>line.includes('getRuntime')?`const getRuntime=()=>globalThis.${runtimeKey};`:line.includes('aiDecision')?'const aiDecision=()=>{throw Error("Unused in online test")};':line.replace(/'@\/(.*?)'/,(_,file)=>JSON.stringify(new URL('../'+file,import.meta.url).href)));
 const route=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'strip'})).toString('base64'));
 const post=async(body,token)=>{const response=await route.POST(new Request('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Room-Token':token}:{})},body:JSON.stringify(body)}));return {status:response.status,...await response.json()}};
 const host=await post({type:'CREATE',name:'A',pawn:4});assert.equal(host.status,200);assert.equal(host.seats[0].pawn,4);
 const guest=await post({type:'JOIN',code:host.code,name:'B',pawn:4});assert.equal(guest.status,200);assert.notEqual(guest.seats[1].pawn,4);
 const third=await post({type:'JOIN',code:host.code,name:'C',pawn:3});assert.equal(third.status,200);
 assert.equal((await post({type:'READY',code:host.code,ready:true,pawn:4},guest.token)).status,400);
 assert.equal((await post({type:'READY',code:host.code,ready:true,pawn:2},'invalid')).status,400);
 const race=await Promise.all([post({type:'READY',code:host.code,ready:true,pawn:5},guest.token),post({type:'READY',code:host.code,ready:true,pawn:5},third.token)]);
 assert.equal(race.filter(r=>r.status===200).length,1);assert.equal(race.filter(r=>r.status===400).length,1);
 for(const token of [guest.token,third.token])assert.equal((await post({type:'READY',code:host.code,ready:true},token)).status,200);
 const started=await post({type:'START',code:host.code},host.token);assert.equal(started.status,200);assert.equal(new Set(started.state.players.map(p=>p.pawn)).size,3);assert.equal(started.state.players[0].pawn,4);
 const reconnected=await route.GET(new Request(`https://game.test/api/game?code=${host.code}`,{headers:{'X-Room-Token':guest.token}}));const snapshot=await reconnected.json();assert.equal(reconnected.status,200);assert.deepEqual(snapshot.state.players.map(p=>p.pawn),started.state.players.map(p=>p.pawn));assert(!snapshot.seats.some(p=>p.token));
 const rejected=await post({type:'READY',code:host.code,ready:true,pawn:2},host.token);assert.equal(rejected.status,400);assert.match(rejected.error,/sudah dimulai/);
});
