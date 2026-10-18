import {BOARD,GROUPS,command,decisionActor,chooseBot,rent,assets} from '../game.mjs';
import {planDecision} from './strategy.mjs';
import {ruleState,legalCandidate} from './candidates.mjs';
import {strategyView} from './memory.mjs';
import {personaFor} from './personas.mjs';
import {AUCTION_RULES} from '../content.mjs';
import {learnedPolicy,predictValues,validLearningModel} from './learning.mjs';
import {LEARNED_MODEL} from './learned-model.mjs';
import {ScenarioRandom} from './scenario-random.mjs';
import {economyRules,strengthShares} from './economy.mjs';
import {riskReserve} from './risk.mjs';
import {tradeAcceptance} from './negotiation.mjs';

export {MIND_VERSION,MODELS,validDifficulty,difficultyFor} from './mind-config.mjs';
import {MIND_VERSION,MODELS,validDifficulty,difficultyFor} from './mind-config.mjs';
export function hashSeed(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function seeded(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

/** No draw order, game RNG, other bots' memory, or private log audience enters search. */
export function observation(state,actor){
 const view=strategyView(state,actor);
 return structuredClone({...view,log:view.log.filter(e=>!e.audience||e.audience==='public')});
}
export function sampleWorld(view,rng){
 const s=structuredClone(ruleState(view));
 for(const deck of Object.values(s.decks))for(let i=deck.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 return s;
}

function easyAction(s,actor,plan,rng){
 const candidates=plan.candidates,find=type=>candidates.find(c=>c.action.type===type);
 for(const type of ['CLAIM_RENT','PAY','START_ROLL','ACK'])if(find(type))return find(type).action;
 if(s.phase==='buy')return (s.players[actor].cash>BOARD[s.buy].price+800?find('BUY'):find('AUCTION'))?.action||plan.action;
 if(s.phase==='auction'){
  const bids=candidates.filter(c=>c.action.type==='BID'&&c.action.amount<=s.players[actor].cash*.65&&c.score>=0).sort((a,b)=>a.action.amount-b.action.amount);
  return (bids.length&&rng()<.78?bids[Math.floor(rng()*Math.min(2,bids.length))]:find('PASS'))?.action||plan.action;
 }
 if(s.phase==='trade')return (find('TRADE_ACCEPT')?.score>0?find('TRADE_ACCEPT'):find('TRADE_REJECT'))?.action||plan.action;
 if(s.phase==='debt')return plan.action; // Never deliberately fail an available rescue.
 const builds=candidates.filter(c=>['BUILD','REDEEM','BUILD_JOIN'].includes(c.action.type)&&c.score>0);
 if(builds.length&&rng()<.72)return builds[Math.floor(rng()*builds.length)].action;
 return find('ROLL')?.action||find('END')?.action||plan.action;
}

/** Auction/buildOffer/rent responses can belong to someone other than the turn owner. */
export function simulationActor(s){
 if(s.phase==='won')return null;
 if(s.phase==='auction')return s.auction.participants.find(i=>!s.players[i].out&&i!==s.auction.highest&&!s.auction.passed.includes(i))??decisionActor(s);
 if(s.phase==='buildOffer')return s.buildOffer.pending[0];
 const claim=s.rentClaims?.find(c=>!s.players[c.to].out&&['roll','end','jail','buy','card'].includes(s.phase));
 return claim?.to??decisionActor(s);
}
// A distribution over public-response policies; unknown human intentions are never consulted.
export function rolloutPolicy(s,actor,rng,options={}){
 if(s.phase==='auction'){
  const a=s.auction,t=BOARD[a.kind==='building'?a.targets[actor]:a.tile],p=s.players[actor];
  const observations=options.noOpponent?null:s.botMemory?.opponents?.[actor];
  const confidence=(observations?.observations||0)/((observations?.observations||0)+8);
  const aggression=1+(Math.min(2,observations?.aggression||1)-1)*confidence;
  const minimum=Math.max(AUCTION_RULES.minimum,a.amount+AUCTION_RULES.increment),limit=Math.min(p.cash*.8,(t.price||t.build)*(1+rng()*.35)*aggression);
  // Sample rational jump bids: one-tick-only rollouts otherwise fail to resolve auctions.
  const amount=Math.max(minimum,Math.floor((minimum+Math.max(0,limit-minimum)*rng()*.4)/AUCTION_RULES.increment)*AUCTION_RULES.increment);
  const action=minimum<=limit?{type:'BID',amount}:{type:'PASS'};
  if(legalCandidate(s,actor,action))return action;
 }
 // A rollout must model economically capable players, not assume the legacy
 // rule bot will waste the opponent's portfolio. No recursive tree search.
 const plan=planDecision(s,actor,{fast:true,ablateTrade:true,publicOpponent:actor!==options.rootActor,ablateOpponent:options.noOpponent});
 if(s.phase==='trade'&&actor!==options.rootActor&&plan.action?.type==='TRADE_ACCEPT'){
  const accept=plan.candidates.find(c=>c.action.type==='TRADE_ACCEPT'),reject=plan.candidates.find(c=>c.action.type==='TRADE_REJECT');
  if(accept&&accept.score<1e7&&reject){const net=accept.score-100,probability=tradeAcceptance(s,actor,{net,raw:Math.abs(net)});return rng()<probability?accept.action:reject.action;}
 }
 return plan.action||chooseBot(s,actor);
}

/** Relative economic utility with terminal victory and insolvency, not a fake winner. */
export function positionValue(s,actor,{noRisk=false,learningModel=null,noLearning=false}={}){
 if(s.players[actor].out)return -200000;
 if(s.phase==='won')return s.winner===actor?200000:-200000;
 const persona=personaFor(s,actor),alive=s.players.filter(p=>!p.out),values=alive.map(p=>{
  let v=p.cash;
  for(const t of assets(s,p.id)){
   const a=s.assets[t.id];v+=a.mortgaged?t.mortgage*.9:t.price*.85;
   v+=(t.build||0)*a.level*.55;
   if(!a.mortgaged)v+=rent(s,t.id,7)*.025*Math.max(1,alive.length-1)*24;
  }
  for(const g of GROUPS)if(g.ids.every(i=>s.assets[i].owner===p.id)){
   const buildCost=g.ids.reduce((n,i)=>n+Math.max(0,3-s.assets[i].level)*BOARD[i].build,0);
   v+=Math.min(4500,buildCost*.45)*Math.min(1,p.cash/Math.max(1,buildCost));
  }
  return {id:p.id,v};
 });
 const own=values.find(p=>p.id===actor).v,opponent=Math.max(1,...values.filter(p=>p.id!==actor).map(p=>p.v));
 let hazard=0;
 if(!noRisk){
  const p=s.players[actor],risk=riskReserve(s,actor,{persona,rolls:1});
  hazard=Math.max(0,risk.cvar-p.cash-risk.buffer*.75)*persona.risk;
  if(s.debt?.from===actor)hazard+=Math.max(0,s.debt.amount-s.players[actor].cash)*.8;
 }
 const unit=economyRules(s).salary,shares=strengthShares(s,BOARD,GROUPS,rent);
 const economic=own-opponent*.65+unit*3.5*own/Math.max(1,own+opponent)-hazard*2+unit*4*(shares[actor]-1/alive.length);
 const learned=!noLearning&&learningModel?predictValues(s,learningModel):null;
 return learned?economic*.6+(learned[actor]-1/alive.length)*20000*.4:economic;
}

const family=type=>['BID','PASS'].includes(type)?type:['BUILD','BUILD_JOIN','REDEEM'].includes(type)?'develop':['OFFER','COUNTER','TRADE_ACCEPT'].includes(type)?'trade':['MORTGAGE','SELL','SELL_SET'].includes(type)?'finance':type;
export function diverseRoots(ranked,limit=4){
 const safe=ranked.filter(c=>c.score>=0),out=[],seen=new Set();
 for(const c of safe){const f=family(c.action.type);if(!seen.has(f)){seen.add(f);out.push(c);if(out.length>=limit)return out;}}
 for(const c of safe)if(!out.includes(c)&&out.length<limit)out.push(c);
 return out;
}
function advanceSandbox(s,actor,action,random,ctx){
 if(ctx.expired())return null;
 const next=command(s,actor,action,random.forAction(s,actor,action));ctx.nodes++;
 if(next.log.length>80)next.log=next.log.slice(0,80);return next;
}
function scenarioValue(s,actor,root,round,ctx,{deep=false,tactical=false}={}){
 const seed=mixScenario(ctx.seed,round),random=new ScenarioRandom(seed),world=sampleWorld(s,random.stream(0,0,'sampled-decks'));
 const base=positionValue(world,actor,ctx.options);let next=world;
 try{
  const path=root.macro?.length?root.macro:[root.action];
  for(let i=0;i<path.length;i++){
   if(i&&(!['roll','end','jail','debt'].includes(next.phase)||simulationActor(next)!==actor))break;
   const leaf=advanceSandbox(next,actor,i?path[i]:root.action,random,ctx);if(!leaf)return null;next=leaf;
  }
  const turns=s.players.filter(p=>!p.out).length*(deep?2:1),maxSteps=tactical?24:deep?80:48;
  for(let step=0;step<maxSteps&&next.turnSerial<s.turnSerial+turns&&next.phase!=='won';step++){
   if(ctx.expired())return null;
   const who=simulationActor(next),intent=rolloutPolicy(next,who,random.policy(next,who),{...ctx.options,rootActor:actor});if(!intent)break;
   const leaf=advanceSandbox(next,who,intent,random,ctx);if(!leaf)return null;next=leaf;
  }
  return ctx.expired()?null:positionValue(next,actor,ctx.options)-base;
 }catch{return null;}
}
function mixScenario(seed,round){return hashSeed(`${seed}:scenario:${round}`);}
function tactical(s,actor,ranked,ctx){
 const roots=ranked.map(c=>({...c,returns:[]}));
 for(let round=0;round<2&&!ctx.expired();round++){
  const batch=roots.map(root=>scenarioValue(s,actor,root,round,ctx,{tactical:true}));
  if(batch.some(v=>v===null))break;batch.forEach((v,i)=>roots[i].returns.push(v));
 }
 return roots.filter(c=>c.returns.length).map(c=>({...c,searchValue:c.returns.reduce((a,b)=>a+b,0)/c.returns.length,score:c.score+c.returns.reduce((a,b)=>a+b,0)/c.returns.length*.25})).sort((a,b)=>b.score-a.score);
}

/**
 * @param {import('./contracts.ts').BotGameState} input Existing engine state; runtime adapter accepts legacy saves too.
 * @param {number} actor
 * @returns {import('./contracts.ts').MindPlan}
 * @param {{difficulty?:string,timeBudgetMs?:number,maxNodes?:number,signal?:AbortSignal,seed?:number,clock?:()=>number,noLookahead?:boolean,noOpponent?:boolean,noRisk?:boolean,noMemory?:boolean,noLearning?:boolean,noPlanning?:boolean,searchVariant?:string,learningModel?:import('./contracts.ts').LearningModel|null,allowCandidateModel?:boolean}} [options]
 */
export function decideMind(input,actor,options={}){
 const clock=options.clock||(()=>performance.now()),started=clock();
 const difficulty=validDifficulty(options.difficulty)?options.difficulty:difficultyFor(input,actor),model=MODELS.find(m=>m.id===difficulty);
 const proposed=options.learningModel??LEARNED_MODEL;
 const learningModel=!options.noLearning&&difficulty==='hardcore'&&validLearningModel(proposed)&&(proposed.status==='promoted'||options.allowCandidateModel===true)?proposed:null;
 options={...options,learningModel};
 const seed=options.seed??hashSeed(`${input.matchId}:${input.version}:${actor}:${difficulty}`);
 const s=observation(input,actor);if(options.noMemory)s.botMemory={version:1,players:{},opponents:{}};
 const plan=planDecision(s,actor,{...options,ablateOpponent:options.noOpponent}),fallback=plan.action;
 const budget=Number.isFinite(options.timeBudgetMs)?Math.min(1800,Math.max(0,options.timeBudgetMs)):model.budget;
 const limit=Number.isSafeInteger(options.maxNodes)?Math.min(2048,Math.max(0,options.maxNodes)):difficulty==='hard'?80:480;
 const ctx={seed,nodes:0,options,expired:()=>options.signal?.aborted||clock()-started>=budget||ctx.nodes>=limit};
 let action=fallback,ranked=plan.candidates.map(c=>({...c})),samples=0,selectedBy='economic';
 const recommendation=learningModel?learnedPolicy(s,actor,plan,learningModel):null;
 if(recommendation){action=recommendation.action;selectedBy='learned-policy';}
 if(difficulty==='easy'){action=easyAction(s,actor,plan,seeded(seed));selectedBy='rule';}
 const strategic=ranked.length>1&&ranked[0].score<1e7&&!['starting','card','mortgage'].includes(s.phase)&&!['CLAIM_RENT','PAY','ROLL','END','ACK'].includes(fallback?.type);
 if(strategic&&!options.noLookahead&&difficulty==='hard'){
  const eligible=diverseRoots(ranked,2);
  const searched=tactical(s,actor,eligible,ctx);
  if(searched.length===eligible.length&&searched.length){action=searched[0].action;selectedBy='tactical';for(const root of searched){const c=ranked.find(c=>c.id===root.id);if(c)c.score=root.score;}}
 }
 let search=[];
 if(strategic&&!options.noLookahead&&difficulty==='hardcore'){
  const best=ranked[0],roots=diverseRoots(ranked,limit>=400?4:2);
  search=roots.map(c=>({...c,returns:[]}));
  // Compare complete paired batches. Per-channel CRN avoids shifting future
  // movement dice when a candidate triggers an extra utility roll or card.
  for(let round=0;round<12&&!ctx.expired()&&search.length>1;round++){
   const batch=[];
   for(const root of search){
    if(ctx.expired())break;
    const value=scenarioValue(s,actor,root,round,ctx,{deep:options.searchVariant==='full'});
    if(value===null)break;batch.push(value);
   }
   // Partial rounds never bias one candidate by receiving a different sample budget.
   if(batch.length!==search.length)break;
   batch.forEach((v,i)=>search[i].returns.push(v));samples++;
   // Successive halving retains the economic control. Eliminate only when a
   // paired uncertainty interval is separated, rather than on one lucky mean.
   if(samples===4&&search.length>2){
    const mean=c=>c.returns.reduce((a,b)=>a+b,0)/samples,ordered=search.slice().sort((a,b)=>(b.score+mean(b)*.35)-(a.score+mean(a)*.35)),winner=ordered[0];
    search=search.filter(root=>{if(root.id===best.id||root===winner)return true;
     const diff=winner.returns.map((v,i)=>v-root.returns[i]),avg=diff.reduce((a,b)=>a+b,0)/samples,se=Math.sqrt(diff.reduce((n,v)=>n+(v-avg)**2,0)/Math.max(1,samples-1)/samples);
     return winner.score-root.score+.35*avg<=1.96*.35*se;
    });
   }
  }
  if(samples>=2){
   const control=search.find(c=>c.id===best.id);
   for(const root of search){
    const count=root.returns.length,mean=root.returns.reduce((n,v)=>n+v,0)/count,tail=root.returns.slice().sort((a,b)=>a-b).slice(0,Math.max(1,Math.ceil(count*.25)));
    const cvar=tail.reduce((n,v)=>n+v,0)/tail.length;
    root.searchValue=mean;root.tail=cvar;root.score+=.35*(options.noRisk?mean:mean*.7+cvar*.3);
   }
   search.sort((a,b)=>b.score-a.score);
   const challenger=search[0];
   if(control&&challenger.id!==control.id){
    const paired=challenger.returns.map((v,i)=>v-control.returns[i]),mean=paired.reduce((n,v)=>n+v,0)/samples;
    const variance=paired.reduce((n,v)=>n+(v-mean)**2,0)/Math.max(1,samples-1);
    const uncertainty=.35*Math.sqrt(variance/samples);
    // Counterfactual promotion requires more than a noisy two-world improvement.
    // This is a conservative finite-sample guard, not a calibrated win probability.
    const margin=Math.max(60,Math.abs(best.score)*.02)+1.5*uncertainty;
    action=challenger.score-control.score>margin?challenger.action:control.action;
   }else action=challenger.action;
   for(const root of search){const c=ranked.find(c=>c.id===root.id);if(c)c.score=root.score;}
   selectedBy='rollout';
  }
 }
 // Search can select only its original economically admissible legal candidates.
 if(!action||!plan.candidates.some(c=>c.id===action.actionId))action=fallback;
 return {...plan,action,candidates:ranked,shouldConsult:input.advisorEnabled===true&&plan.shouldConsult,
  diagnostics:{version:MIND_VERSION,model:model.code,algorithm:model.algorithm,selectedBy,actor,persona:personaFor(s,actor).id,elapsedMs:Math.max(0,clock()-started),nodes:ctx.nodes,samples,interrupted:!!options.signal?.aborted,budgetExhausted:strategic&&['hard','hardcore'].includes(difficulty)&&(ctx.nodes>=limit||clock()-started>=budget),learning:{enabled:!!learningModel,status:proposed?.status||'untrained',policyUsed:!!recommendation,valueUsed:!!learningModel&&samples>0},search:search.map(c=>({id:c.id,mean:c.searchValue??null,tail:c.tail??null,samples:c.returns.length})),selected:action?.actionId}};
}
