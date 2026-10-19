import {createGame,stock,BOARD,DECKS,GROUPS} from '../../../lib/game.mjs';
import {commandWithTradeResult as command} from '../../../lib/trade-command.mjs';
import {decidePersona} from '../../../lib/bot/persona-router.mjs';
import {PERSONAS} from '../../../lib/bot/personas.mjs';
import {botActor} from '../../../lib/server/bot-worker.mjs';
import {brokerIntentMetadata} from '../../../lib/bot/broker-intent.mjs';
import {writeFileSync,appendFileSync} from 'node:fs';
const out='docs/qa/evidence/', runs=[];const count=Number(process.env.QA_MATCHES||100),maxActions=4000,budget=4,maxMs=20000;
function invariant(s){
 for(const p of s.players){if(!Number.isSafeInteger(p.cash)||p.cash<0)throw Error('invalid_cash:'+p.id);if(p.out&&Object.values(s.assets).some(a=>a.owner===p.id))throw Error('out_owner:'+p.id);if(p.pos<0||p.pos>39)throw Error('position');}
 for(const [id,a] of Object.entries(s.assets)){if(!Number.isInteger(a.level)||a.level<0||a.level>5)throw Error('level:'+id);if(a.owner!==null&&!s.players[a.owner])throw Error('owner');if(a.mortgaged&&a.level)throw Error('mortgaged_building');}
 const bank=stock(s);if(bank.houses<0||bank.hotels<0||JSON.stringify(bank)!==JSON.stringify(s.bank))throw Error('stock');
 for(const g of GROUPS){const as=g.ids.map(i=>s.assets[i]);if(as.some(a=>a.level)){if(new Set(as.map(a=>a.owner)).size!==1||as[0].owner===null)throw Error('building_group_owner');if(Math.max(...as.map(a=>a.level))-Math.min(...as.map(a=>a.level))>1)throw Error('uneven_building');}}
 for(const [deck,cards] of Object.entries(DECKS)){let ids=[...s.decks[deck],...s.players.flatMap(p=>p.cards.filter(c=>c.deck===deck).map(c=>c.idx))];if(s.card?.deck===deck&&s.card.jailCard)ids.push(s.card.idx);if(ids.length!==cards.length||new Set(ids).size!==ids.length)throw Error('deck_conservation:'+deck);}
 if(s.phase==='won'&&(s.players.filter(p=>!p.out).length!==1||s.players[s.winner].out))throw Error('winner');
}
const sig=s=>JSON.stringify({turn:s.turn,phase:s.phase,players:s.players.map(p=>[p.pos,p.cash,p.inJail,p.out]),assets:s.assets,debt:s.debt,trade:s.trade&&{from:s.trade.from,to:s.trade.to,give:s.trade.give,take:s.trade.take,giveCash:s.trade.giveCash,takeCash:s.trade.takeCash},auction:s.auction,doubles:s.doubles,extra:s.extra});
for(let m=0;m<count;m++){
 const n=[2,3,4,5,6][m%5],seed=(0x4e550000+m*997)>>>0;let z=seed;const rng=()=>{z=(Math.imul(z,1664525)+1013904223)>>>0;return z/4294967296};
 const roster=Array.from({length:n},(_,i)=>PERSONAS[(m+i)%6]);let s=createGame({matchId:'qa-seed-'+seed,startingRoll:m%2===0,players:roster.map(p=>({name:p.name,controller:'bot',botPersona:p.id,botDifficulty:'hardcore'}))},rng);
 const t=performance.now(),hist={},lat=[],recent=[],signatures=new Map();let actions=0,stopReason=null,error=null,loopEvidence=null;
 while(s.phase!=='won'&&actions<maxActions&&performance.now()-t<maxMs){let actor=botActor(s),a;
 try{
  invariant(s);if(actor===null)throw Error('no_actor');const before=s,at=performance.now();const plan=decidePersona(s,actor,{timeBudgetMs:budget});lat.push(performance.now()-at);a=plan.action;if(!a)throw Error('no_action');hist[a.type]=(hist[a.type]||0)+1;
  s=command(s,actor,{...a,...brokerIntentMetadata(s,actor,a),id:`qa-${m}-${actions}`,expectedVersion:s.version},rng);actions++;invariant(s);
  const events=s.log.filter(e=>e.id>before.eventId);let expected=before.players.map(p=>p.cash);for(const e of events)for(const f of e.finance||[]){if(f.from!==null)expected[f.from]-=f.amount;if(f.to!==null)expected[f.to]+=f.amount;}
  if(expected.some((cash,i)=>cash!==s.players[i].cash))throw Error('finance_ledger_mismatch:'+JSON.stringify({before:before.players.map(p=>p.cash),actual:s.players.map(p=>p.cash),expected,events}));
  recent.push({actor,action:a,version:s.version,phase:s.phase,turn:s.turn,cash:s.players.map(p=>p.cash)});if(recent.length>32)recent.shift();
  const key=sig(s);const hits=(signatures.get(key)||0)+1;signatures.set(key,hits);if(hits===12){loopEvidence={state:s,actions:recent};stopReason='repeated_economic_state_12';break;}
 }catch(e){error={message:e.message,stack:e.stack,actor,action:a,state:s,recent};stopReason='error';break;}
 }
 if(!stopReason)stopReason=s.phase==='won'?'normal_winner':actions>=maxActions?'action_limit':'time_limit';
 lat.sort((a,b)=>a-b);const r={match:m,seed,n,roster:roster.map(p=>p.id),actions,durationMs:performance.now()-t,stopReason,winner:s.phase==='won'?s.players[s.winner].botPersona:null,round:s.round,phase:s.phase,histogram:hist,decisionMs:{p50:lat[Math.floor(lat.length*.5)],p95:lat[Math.floor(lat.length*.95)],max:lat.at(-1)},error:error?.message||null};
 if(error||loopEvidence){const file=`benchmark-state-${m}.json`;writeFileSync(out+file,JSON.stringify({error,loopEvidence},null,2));r.evidence=file;}
 runs.push(r);writeFileSync(out+'benchmark.json',JSON.stringify({configuration:{count,maxActions,budget,maxMs,seedPolicy:'LCG engine RNG; planner timing budget is not deterministic; production models unchanged'},runs},null,2));console.log(JSON.stringify(r));
}
