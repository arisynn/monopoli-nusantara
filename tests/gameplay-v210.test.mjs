import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,command,publicState,BOARD,DECKS} from '../lib/game.mjs';
import {money,parseNusa,nusaInput,nusaText,CURRENCY} from '../lib/currency.mjs';
import {projectAuction,dismissAuctionResult,auctionIdentity} from '../lib/auction-presentation.mjs';
import {gameplayDecision,selectGameplayPopup} from '../lib/gameplay-presentation.mjs';
import {mergeState,acceptRevision} from '../lib/room-client.mjs';
import {validateLocalState,serializeSave,parseSave} from '../lib/save-format.mjs';
import {summarizeNotices} from '../lib/quick-notice.mjs';
import {diceTiming,playerColumns} from '../lib/dice-timing.mjs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const setup=(n=3)=>createGame({players:Array.from({length:n},(_,i)=>({name:'P'+i})),startingRoll:false},()=>.3);
const cmd=(s,actor,type,data={})=>command(s,actor,{type,...data},()=>.2);
const auction=()=>{const s=setup();s.phase='buy';s.buy=37;return cmd(s,0,'AUCTION')};
function finish(s){s=cmd(s,1,'BID',{amount:800});s=cmd(s,0,'PASS');return cmd(s,2,'PASS',{id:'finish'})}

test('Nusa denomination is exact, including one stored unit and safe integer limits',()=>{
 assert.equal(CURRENCY.unitsPerNusa,10);assert.equal(money(15000),'N 1.500');assert.equal(money(1150),'N 115');assert.equal(money(1),'N 0,1');assert.equal(money(-1),'N -0,1');
 for(const units of [0,1,9,10,11,250,15000,Number.MAX_SAFE_INTEGER,...Array.from({length:200},(_,i)=>i*13)])assert.equal(parseNusa(nusaInput(units)),units);
 for(const value of ['1.01','-1','1e3','abc','900719925474099.2'])assert.equal(parseNusa(value),null);
 assert.equal(parseNusa('0,1'),1);assert.equal(parseNusa('80'),800);
});
test('all board prices/rents/build/mortgage/tax and all 32 card numeric effects match v2.9',()=>{
 const expected=JSON.parse(read('./fixtures/economy-v29.json'));
 assert.deepEqual(BOARD.map(({name,color,...numeric})=>numeric),expected.board);
 assert.deepEqual(Object.fromEntries(Object.entries(DECKS).map(([name,cards])=>[name,cards.map(({title,text,...effect})=>effect)])),expected.decks);
 assert(DECKS.chance.every(c=>!c.text.includes('Rp')));assert(DECKS.community.every(c=>!c.text.includes('Rp')));
});
test('old history and active card text convert without touching old save balances or stored text',()=>{
 const s=setup();s.log[0].text='Modal Rp15.000. Terima Rp250; bayar Rp1.150.';
 const before=structuredClone(s),saved=parseSave(serializeSave({state:s,room:null})).state;
 assert.deepEqual(saved,before);assert.equal(nusaText(saved.log[0].text),'Modal N 1.500. Terima N 25; bayar N 115.');
 assert.equal(saved.players[0].cash,15000);assert.equal(saved.schemaVersion,2);
});
test('one-tenth Nusa trades use integer commands and stay atomic',()=>{
 let s=setup();const t={to:1,give:[],take:[],giveCash:parseNusa('0.1'),takeCash:0,giveCards:0,takeCards:0};
 s=cmd(s,0,'OFFER',{trade:t});s=cmd(s,1,'TRADE_ACCEPT',{id:'trade'});
 assert.equal(s.players[0].cash,14999);assert.equal(s.players[1].cash,15001);assert.equal(money(s.players[0].cash),'N 1.499,9');
 assert.equal(cmd(s,1,'TRADE_ACCEPT',{id:'trade'}),s);
});
test('live auction popup identity stays unchanged across every bidder update, busy frame and dismissal',()=>{
 let s=auction();const key=auctionIdentity(s),decision=gameplayDecision(s).key;
 for(const [actor,type,data] of [[0,'BID',{amount:100}],[1,'BID',{amount:200}],[2,'PASS',{}],[0,'BID',{amount:300}]]){
  s=cmd(s,actor,type,data);assert.equal(auctionIdentity(s),key);assert.equal(gameplayDecision(s).key,decision);
  assert.equal(selectGameplayPopup({ready:false,auctionActive:true}),'auction');
 }
 assert.equal(selectGameplayPopup({ready:true,eligible:true,decision:gameplayDecision(s),auctionActive:true,auctionDismissed:true}),null);
 assert.equal(selectGameplayPopup({menu:'manage',auctionActive:true}),'manage');
});
test('property auction finalizes once with correct winner, property, price and persistent log result',()=>{
 const start=auction(),s=finish(start),event=s.log.find(e=>e.type==='auctionResult');
 assert.equal(s.assets[37].owner,1);assert.equal(s.players[1].cash,14200);
 assert.equal(event.auctionResult.winner,1);assert.equal(event.auctionResult.tile,37);assert.equal(event.auctionResult.amount,800);
 assert.equal(event.auctionResult.auctionId,auctionIdentity(start));assert.match(event.text,/P1.*Raja Ampat.*N 80/);
 assert.equal(cmd(s,2,'PASS',{id:'finish'}),s);assert.equal(s.log.filter(e=>e.type==='auctionResult').length,1);
 assert.doesNotThrow(()=>validateLocalState(s));
});
test('live -> result has no empty presentation frame, then closes without replay',()=>{
 const s=auction(),baseline=projectAuction(null,s),done=finish(s);
 const model=projectAuction(baseline,done);
 assert.equal(model.results.length,1);assert.equal(selectGameplayPopup({ready:false,auctionResult:!!model.results[0]}),'auction');
 const dismissed=dismissAuctionResult(model,model.results[0].id);
 assert.equal(projectAuction(dismissed,done).results.length,0);
 assert.equal(selectGameplayPopup({ready:true}),null);
});
test('auction results are identical in public room snapshots and ignore repeated or late updates',()=>{
 const start=auction(),initial=projectAuction(null,publicState(start)),done=finish(start),view=publicState(done);
 const first=projectAuction(initial,view),second=projectAuction(initial,view);
 assert.deepEqual(first.results,second.results);assert.deepEqual(view.log.find(e=>e.type==='auctionResult').auctionResult,done.log.find(e=>e.type==='auctionResult').auctionResult);
 assert.equal(projectAuction(first,view),first);assert.equal(projectAuction(first,publicState(start)),first);
 assert.equal(mergeState(view,publicState(start)),view);assert.equal(acceptRevision(8,7),false);
});
test('reconnect restores live auction but baselines final results instead of replaying them',()=>{
 const start=auction(),bid=cmd(start,1,'BID',{amount:100});
 const live=projectAuction(null,publicState(bid));assert.equal(live.results.length,0);assert.equal(bid.auction.highest,1);
 assert.equal(auctionIdentity(validateLocalState(bid)),auctionIdentity(start));
 const done=finish(start),after=projectAuction(null,done);assert.equal(after.results.length,0);
 assert(done.log.some(e=>e.type==='auctionResult'));
 assert.equal(projectAuction(live,done,true,1).results.length,0);
});
test('no-bid auction has no invented winner, payment, or property owner',()=>{
 const start=auction();let s=start;for(const id of [0,1,2])s=cmd(s,id,'PASS');
 const result=s.log.find(e=>e.type==='auctionResult').auctionResult;
 assert.equal(result.winner,null);assert.equal(result.amount,0);assert.equal(s.assets[37].owner,null);assert(s.players.every(p=>p.cash===15000));
 assert.match(s.log.find(e=>e.type==='auctionResult').text,/tanpa pemenang/);
});
function scarce(){const s=setup();for(const id of [1,3])Object.assign(s.assets[id],{owner:0,level:1});for(const id of [6,8,9])Object.assign(s.assets[id],{owner:1,level:3});for(const id of [11,13,14])Object.assign(s.assets[id],{owner:1,level:4});Object.assign(s.assets[16],{owner:1,level:2});for(const id of [18,19])Object.assign(s.assets[id],{owner:1,level:3});return s}
test('scarce building auction publishes the actual built property, winner, price and stock',()=>{
 let s=cmd(scarce(),0,'BUILD',{tile:1});s=cmd(s,1,'BUILD_JOIN',{tile:6});const id=auctionIdentity(s);
 s=cmd(s,1,'BID',{amount:100});s=cmd(s,0,'PASS');
 const result=s.log.find(e=>e.type==='auctionResult').auctionResult;
 assert.equal(result.auctionId,id);assert.equal(result.kind,'building');assert.equal(result.tile,6);assert.equal(result.winner,1);assert.equal(result.amount,100);assert.equal(s.assets[6].level,4);assert.equal(s.bank.houses,0);
 assert.doesNotThrow(()=>validateLocalState(s));
});
test('legacy v1 saves keep numeric rules and get authoritative results without migrating',async()=>{
 const legacy=await import('../lib/game-v1.mjs');let s=legacy.createGame({players:[{name:'A'},{name:'B'}]},()=>.2);s.phase='buy';s.buy=1;
 s=cmd(s,0,'AUCTION');s=cmd(s,0,'BID',{amount:101});s=cmd(s,1,'PASS');
 assert.equal(s.schemaVersion,1);assert.equal(s.players[0].cash,14899);
 assert.equal(s.log.find(e=>e.type==='auctionResult').auctionResult.amount,101);assert.doesNotThrow(()=>validateLocalState(s));
});
test('unauthorized bids, insufficient funds and wrong increments still fail in the engine',()=>{
 const s=auction();s.players[2].out=true;
 assert.throws(()=>cmd(s,2,'BID',{amount:100}));assert.throws(()=>cmd(s,0,'BID',{amount:101}));assert.throws(()=>cmd(s,0,'BID',{amount:20000}));
 assert.equal(s.auction.highest,null);assert.equal(s.players[0].cash,15000);
});
test('routine events produce no transient feedback, rejected trades retain inline feedback',()=>{
 for(const type of ['turn','move','dice','buy','build','money','rent'])assert.equal(summarizeNotices([{id:1,type,text:'Peristiwa biasa'}]),null);
 assert.equal(summarizeNotices([{id:1,type:'trade',text:'Barter selesai.'}]),null);
 assert.equal(summarizeNotices([{id:2,type:'trade',text:'Tawaran A kepada B ditolak.'}]).kind,'warning');
});
test('2-6 player grids have readable rows without horizontal viewport movement',()=>{
 assert.deepEqual([2,3,4,5,6].map(playerColumns),[2,3,2,3,3]);
 assert([2,3,4,5,6].every(n=>Math.ceil(n/playerColumns(n))<=2));
 const source=read('../components/game/PlayerCapsules.tsx'),css=read('../app/globals.css');
 assert(source.includes('money(p.cash)'));assert(source.includes('aria-current'));assert(source.includes('p.inJail'));
 assert(css.includes('grid-template-columns:repeat(var(--capsule-columns),minmax(0,1fr))'));assert(css.includes('min-height:44px;height:44px'));
});
test('dice timing supports reduced motion/fast mode and faces use only actual results',()=>{
 assert(diceTiming({fast:true}).roll<diceTiming().roll);assert(diceTiming({reduced:true}).roll<diceTiming({fast:true}).roll);
 const fx=read('../components/game/DiceRollFx.tsx'),board=read('../components/game/Board.tsx'),game=read('../components/game/Game.tsx');
 assert(fx.includes('orientations[dice[i]]'));assert(!fx.includes('Math.random'));assert(!fx.includes('rolling?(i?5:2)'));
 assert(!board.includes('.settle+20'));assert(board.includes('moveIdToAnimate'));assert(game.includes('diceSettlingRef.current'));assert(game.includes('busyRef.current||Date.now()<actionLock.current'));
});
test('gameplay feedback is inline and the shared auction modal has no state-version key',()=>{
 const game=read('../components/game/Game.tsx'),inline=read('../components/game/InlineFeedback.tsx');
 assert(game.includes('(home||roomLobby)&&(err?<GameNotice'));
 assert(game.includes('<MobileDock feedback={feedback}'));assert(game.includes("displaySheet==='auction'?<AuctionPanel"));
 assert(!game.includes('<AuctionPanel key='));assert(!inline.includes('modal-backdrop'));
});

test('consecutive bank auctions keep one module while each authoritative result is queued once',()=>{
 let s=setup(4);s.assets[1].owner=0;s.assets[1].mortgaged=true;s.assets[3].owner=0;s.assets[3].mortgaged=true;s.players[0].cash=0;s.phase='debt';s.debt={from:0,to:null,amount:100,label:'Pajak'};
 s=cmd(s,0,'BANKRUPT');const first=auctionIdentity(s),baseline=projectAuction(null,s);
 s=cmd(s,1,'BID',{amount:100});s=cmd(s,2,'PASS');s=cmd(s,3,'PASS');
 assert.equal(s.phase,'auction');assert.equal(s.auction.tile,3);assert.notEqual(auctionIdentity(s),first);
 let model=projectAuction(baseline,s);assert.equal(model.results[0].tile,1);
 assert.equal(selectGameplayPopup({auctionActive:true,auctionResult:true,ready:false}),'auction');
 s=cmd(s,1,'BID',{amount:200});s=cmd(s,2,'PASS');s=cmd(s,3,'PASS');
 model=projectAuction(model,s);assert.deepEqual(model.results.map(r=>r.tile),[1,3]);
 model=dismissAuctionResult(model,model.results[0].id);assert.equal(model.results[0].tile,3);
 assert.equal(s.players[1].cash,14700);assert.equal(s.assets[1].owner,1);assert.equal(s.assets[3].owner,1);
});
test('an auction restored without a new ID remains stable and publishes a matching result',()=>{
 let s=auction();delete s.auction.id;const id=auctionIdentity(s);
 s=cmd(s,1,'BID',{amount:100});assert.equal(auctionIdentity(s),id);
 s=cmd(s,0,'PASS');s=cmd(s,2,'PASS');assert.equal(s.log.find(e=>e.type==='auctionResult').auctionResult.auctionId,id);
 assert.doesNotThrow(()=>validateLocalState(s));
});
