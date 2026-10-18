import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,command,publicState} from '../lib/game.mjs';
import {brokerIntentMetadata} from '../lib/bot/broker-intent.mjs';
import {GameSession} from '../frontend/session.mjs';
import {runBotWorker} from '../lib/server/bot-worker.mjs';
import {BotJobStore} from './helpers/bot-job-store.mjs';

function board() {
  const state=createGame({startingRoll:false,players:[{name:'Key holder'},{name:'Bait holder'},
    {name:'NUSA',controller:'bot',botPersona:'nusa'}]},()=>0.2);
  state.turn=2;state.phase='end';
  state.assets[1].owner=2;state.assets[3].owner=0;state.assets[11].owner=1;
  return state;
}
const first=()=>({type:'OFFER',actionId:'nusa-2hop-broker-step1-11-for-3',
  trade:{to:1,give:[],take:[11],giveCash:1000,takeCash:0,giveCards:0,takeCards:0}});
const second=()=>({type:'OFFER',actionId:'nusa-broker-step2-11-for-3',
  trade:{to:0,give:[11],take:[3],giveCash:0,takeCash:0,giveCards:0,takeCards:0}});

test('broker metadata is restricted to bot NUSA offers and stays separate from command IDs',()=>{
  const state=board(),action=first();
  assert.deepEqual(brokerIntentMetadata(state,2,action),{actionId:action.actionId});
  for(const actor of [0,1,99,-1,'2'])assert.deepEqual(brokerIntentMetadata(state,actor,action),{});
  assert.deepEqual(brokerIntentMetadata(state,2,{...action,type:'ROLL'}),{});
  assert.deepEqual(brokerIntentMetadata(state,2,{...action,actionId:'c17'}),{});
  state.players[2].botPersona='apex';assert.deepEqual(brokerIntentMetadata(state,2,action),{});
});

test('local GameSession persists a confirmed same-turn broker chain through both dispatches',async t=>{
  const actions=[first(),second()];
  const session=new GameSession({persist:async()=>{},archive:async()=>{},load:async()=>null,
    random:()=>0.2,mind:{decide:async()=>({action:actions.shift(),shouldConsult:false}),dispose(){}}});
  session.hidden=true;session.screen='gameplay';session.ingest(board(),{reset:true});
  t.after(()=>session.dispose());
  await session.stepBot();
  assert.equal(session.state.phase,'trade');assert.equal(session.state.version,1);
  assert.equal(session.state.botMemory.players[2].nusaBroker.stage,'awaiting_step1');
  assert.equal(session.state.botMemory.players[2].nusaTurnTradeCount,1);
  assert.notEqual(session.state.seen[0],first().actionId);
  session.ingest(command(session.state,1,{type:'TRADE_ACCEPT'}),{reset:true});
  assert.equal(session.state.botMemory.players[2].nusaBroker.stage,'ready_step2');
  await session.stepBot();
  assert.equal(session.state.version,3);
  assert.equal(session.state.botMemory.players[2].nusaBroker.stage,'awaiting_step2');
  assert.equal(session.state.botMemory.players[2].nusaTurnTradeCount,2);
  session.ingest(command(session.state,0,{type:'TRADE_ACCEPT'}),{reset:true});
  assert.equal(session.state.assets[3].owner,2);
  assert.equal(session.state.botMemory.players[2].nusaBroker.stage,'develop');
  assert.equal(publicState(session.state).botMemory,undefined);
});

test('online job worker forwards the broker marker while preserving authoritative version and idempotency',async()=>{
  const now=1000000,clock=()=>now,store=new BotJobStore(clock),state=board();
  const seats=state.players.map((p,id)=>({...p,memberId:`member-${id}`,connections:p.controller==='human'?{test:now}:{}}));
  const room={code:'ABCDEFGH',status:'playing',host:0,seats,state,vote:null,pause:null};
  await store.commit({revision:-1},room);
  const result=await runBotWorker({store,clock,maxSteps:1,rng:()=>0.2,
    decide:async()=>({action:{...first(),id:'untrusted',expectedVersion:999},status:'local'})});
  assert.equal(result.committed,1);
  const committed=store.rooms.get('ABCDEFGH').data.state;
  assert.equal(committed.version,1);assert.equal(committed.phase,'trade');
  assert.equal(committed.botMemory.players[2].nusaBroker.stage,'awaiting_step1');
  assert.equal(committed.botMemory.players[2].nusaTurnTradeCount,1);
  assert(committed.seen.includes(`bot:${state.matchId}:0`));assert(!committed.seen.includes('untrusted'));
  assert.equal(store.botActions.size,1);
});
