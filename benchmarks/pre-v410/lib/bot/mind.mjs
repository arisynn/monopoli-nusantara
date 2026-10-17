import {BOARD,GROUPS,command,decisionActor,chooseBot,rent,assets} from '../game.mjs';
import {planDecision} from './strategy.mjs';
import {ruleState,legalCandidate} from './candidates.mjs';
import {strategyView} from './memory.mjs';
import {personaFor} from './personas.mjs';
import {AUCTION_RULES} from '../content.mjs';
import {learnedPolicy,predictValues,validLearningModel} from './learning.mjs';
import {LEARNED_MODEL} from './learned-model.mjs';

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
  const amount=Math.floor((minimum+Math.max(0,limit-minimum)*rng()*.4)/AUCTION_RULES.increment)*AUCTION_RULES.increment;
  const action=minimum<=limit?{type:'BID',amount}:{type:'PASS'};
  if(legalCandidate(s,actor,action))return action;
 }
 // A rollout must model economically capable players, not assume the legacy
 // rule bot will waste the opponent's portfolio. No recursive tree search.
 return planDecision(s,actor,{fast:true,ablateTrade:options.noNegotiation===true,ablateOpponent:options.noOpponent}).action||chooseBot(s,actor);
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
  const p=s.players[actor];
  for(let d1=1;d1<=6;d1++)for(let d2=1;d2<=6;d2++){
   const tile=(p.pos+d1+d2)%40,a=s.assets[tile];if(a?.owner!=null&&a.owner!==actor&&!a.mortgaged){const bill=rent(s,tile,d1+d2);hazard+=Math.max(0,bill-p.cash)*persona.risk/36;}
  }
  if(s.debt?.from===actor)hazard+=Math.max(0,s.debt.amount-s.players[actor].cash)*.8;
 }
 const economic=own-opponent*.65+7000*own/Math.max(1,own+opponent)-hazard*2;
 const learned=!noLearning&&learningModel?predictValues(s,learningModel):null;
 return learned?economic*.6+(learned[actor]-1/alive.length)*20000*.4:economic;
}

function tactical(s,actor,ranked,ctx){
 // Exact management beam: compare the next affordable development/finance action.
 const base=positionValue(s,actor,ctx.options),out=[];
 for(const c of ranked){
  if(ctx.expired())break;
  const rng=seeded(ctx.seed),world=sampleWorld(s,rng);let next;
  try{next=command(world,actor,c.action,rng);ctx.nodes++;}catch{continue;}
  let value=positionValue(next,actor,ctx.options)-base;
  if(!['OFFER','COUNTER'].includes(c.action.type)&&simulationActor(next)===actor&&['roll','end','debt'].includes(next.phase)){
   const continuation=planDecision(next,actor,ctx.options).candidates.filter(x=>['BUILD','REDEEM','SELL','MORTGAGE','PAY'].includes(x.action.type)).slice(0,3);
   for(const second of continuation){if(ctx.expired())break;try{const leaf=command(next,actor,second.action,rng);ctx.nodes++;value=Math.max(value,positionValue(leaf,actor,ctx.options)-base);}catch{}}
  }
  // Tactical response phase: two public-information futures, not perfect knowledge.
  let responseValue=0,completed=0;
  for(let scenario=0;scenario<2&&!ctx.expired();scenario++){
   let leaf=next;const responseRng=seeded(ctx.seed+scenario*997);
   for(let step=0;step<24&&leaf.turnSerial<next.turnSerial+1&&leaf.phase!=='won'&&!ctx.expired();step++){
    const who=simulationActor(leaf),intent=rolloutPolicy(leaf,who,responseRng,ctx.options);if(!intent)break;
    try{leaf=command(leaf,who,intent,responseRng);ctx.nodes++;}catch{break;}
   }
   if(!ctx.expired()){responseValue+=positionValue(leaf,actor,ctx.options)-base;completed++;}
  }
  if(completed)value=value*.5+responseValue/completed*.5;
  out.push({...c,searchValue:value,score:c.score+value*.25});
 }
 return out.sort((a,b)=>b.score-a.score);
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
 const strategic=ranked.length>1&&!['starting','card','mortgage'].includes(s.phase)&&!['CLAIM_RENT','PAY','ROLL','END','ACK'].includes(fallback?.type);
 if(strategic&&!options.noLookahead&&difficulty==='hard'){
  const top=ranked[0],eligible=ranked.filter(c=>c.score>=Math.max(0,top.score-Math.max(400,Math.abs(top.score)*.3))).slice(0,5);
  const searched=tactical(s,actor,eligible,ctx);
  if(searched.length===eligible.length&&searched.length){action=searched[0].action;selectedBy='tactical';for(const root of searched){const c=ranked.find(c=>c.id===root.id);if(c)c.score=root.score;}}
 }
 let search=[];
 if(strategic&&!options.noLookahead&&difficulty==='hardcore'){
  const best=ranked[0],roots=ranked.filter(c=>c.score>=Math.max(0,best.score-Math.max(500,Math.abs(best.score)*.35))).slice(0,4);
  search=roots.map(c=>({...c,returns:[]}));
  const legacyHorizon=options.searchVariant==='legacy',depth=legacyHorizon?6:options.searchVariant==='full'?72:48,turns=options.searchVariant==='full'?2:1;
  // Paired worlds/common random numbers reduce variance across alternatives.
  for(let round=0;round<12&&!ctx.expired()&&search.length>1;round++){
   const batch=[];
   for(const root of search){
    if(ctx.expired())break;
    const rng=seeded(seed+Math.imul(round+1,2654435761)),world=sampleWorld(s,rng);
    const initial=positionValue(world,actor,options);let next=world;
    try{next=command(world,actor,root.action,rng);ctx.nodes++;}catch{break;}
    for(let step=0;step<depth&&(legacyHorizon||next.turnSerial<s.turnSerial+turns)&&next.phase!=='won'&&!ctx.expired();step++){
     const who=simulationActor(next),intent=rolloutPolicy(next,who,rng,options);if(!intent)break;
     try{next=command(next,who,intent,rng);ctx.nodes++;}catch{break;}
    }
    if(ctx.expired())break;batch.push(positionValue(next,actor,options)-initial);
   }
   // Partial rounds never bias one candidate by receiving a different sample budget.
   if(batch.length!==search.length)break;
   batch.forEach((v,i)=>search[i].returns.push(v));samples++;
  }
  if(samples>=2){
   const control=search.find(c=>c.id===best.id);
   for(const root of search){
    const mean=root.returns.reduce((n,v)=>n+v,0)/samples,tail=root.returns.slice().sort((a,b)=>a-b).slice(0,Math.max(1,Math.ceil(samples*.25)));
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
