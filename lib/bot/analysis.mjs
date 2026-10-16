import {BOARD,GROUPS,DECKS} from '../content.mjs';
import {rent,assets,complete,stock} from '../game.mjs';
import {personaFor} from './personas.mjs';
export const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
const transitionCache=new Map();
function matrixFor(state){
 const held=new Set(state.players.flatMap(p=>p.cards||[]).map(c=>c.deck+':'+c.idx));
 const key=[...held].sort().join(',');if(transitionCache.has(key))return transitionCache.get(key);
 function landing(pos,depth=0){
  if(pos===30)return [[10,1]];
  const t=BOARD[pos];if(depth>2||!['chance','community'].includes(t.type))return [[pos,1]];
  const deck=DECKS[t.type].filter((_,i)=>!held.has(t.type+':'+i)),out=[];
  for(const c of deck){let dest=pos;
   if(c.jail)dest=10;else if(c.move!==undefined)dest=c.move;else if(c.back)dest=(pos-c.back+40)%40;
   else if(c.nearest){do{dest=(dest+1)%40}while(BOARD[dest].type!==c.nearest)}
   if(dest!==pos&&!c.jail)for(const [where,p] of landing(dest,depth+1))out.push([where,p/deck.length]);
   else out.push([dest,1/deck.length]);
  }
  return out;
 }
 const matrix=Array.from({length:40},(_,pos)=>{const out=Array(40).fill(0);for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(const [where,p] of landing((pos+a+b)%40))out[where]+=p/36;return out;});
 // Stationary estimate uses public card definitions, never the shuffled draw order.
 let steady=Array(40).fill(1/40);for(let i=0;i<50;i++){const next=Array(40).fill(0);for(let p=0;p<40;p++)for(let q=0;q<40;q++)next[q]+=steady[p]*matrix[p][q];steady=next;}
 const value={matrix,steady,landing};if(transitionCache.size>=8)transitionCache.delete(transitionCache.keys().next().value);transitionCache.set(key,value);return value;
}
export function landingProbabilities(state,id,rolls=3){
 const {matrix,landing}=matrixFor(state),player=state.players[id],total=Array(40).fill(0);let current=Array(40).fill(0);
 if(player.inJail){for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
  if(a!==b&&player.jail<2)continue;for(const [pos,p] of landing((10+a+b)%40))current[pos]+=p/36;
 }current[10]+=1-current.reduce((a,b)=>a+b,0);
 }else if(state.turn===id&&state.doubles===2){for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){if(a===b){current[10]+=1/36;continue}for(const [pos,p] of landing((player.pos+a+b)%40))current[pos]+=p/36;}}
 else current=[...matrix[player.pos]];
 for(let step=0;step<rolls;step++){for(let pos=0;pos<40;pos++)total[pos]+=current[pos];const next=Array(40).fill(0);for(let p=0;p<40;p++)if(current[p])for(let q=0;q<40;q++)next[q]+=current[p]*matrix[p][q];current=next;}
 return total;
}
export function analyzeState(s,id,options={}){
 const persona=personaFor(s,id),others=s.players.filter(p=>p.id!==id&&!p.out),own=assets(s,id),prob=landingProbabilities(s,id,2);
 const visits=others.map(p=>landingProbabilities(s,p.id,3));const steady=matrixFor(s).steady;
 const exposure=BOARD.filter(t=>s.assets[t.id]?.owner!==null&&s.assets[t.id]?.owner!==undefined&&s.assets[t.id].owner!==id&&!s.assets[t.id].mortgaged);
 const expectedRisk=exposure.reduce((n,t)=>n+prob[t.id]*rent(s,t.id,7),0);
 const peakRisk=Math.max(0,...exposure.filter(t=>prob[t.id]>.02).map(t=>rent(s,t.id,7)*Math.min(.5,prob[t.id]*2)));
 const taxRisk=BOARD.filter(t=>t.type==='tax').reduce((n,t)=>n+prob[t.id]*t.tax,0);
 const income=own.reduce((n,t)=>n+visits.reduce((a,v)=>a+v[t.id],0)*rent(s,t.id,7),0);
 const debt=s.debt?.from===id?s.debt.amount:0;
 const reserved=s.auction?.highest===id?s.auction.amount:0;
 const readyGroups=GROUPS.map((g,index)=>({...g,index,owned:g.ids.filter(t=>s.assets[t].owner===id).length,
  opponentMax:Math.max(0,...others.map(p=>g.ids.filter(t=>s.assets[t].owner===p.id).length)),
  roi:g.ids.reduce((n,t)=>n+BOARD[t].rents[3]*steady[t],0)/(g.ids.length*3*BOARD[g.ids[0]].build)}));
 const targets=readyGroups.filter(g=>g.owned>0).sort((a,b)=>((b.owned/b.ids.length)*2+b.roi*15)-((a.owned/a.ids.length)*2+a.roi*15));
 const targetGroup=targets[0]?.index??readyGroups.slice().sort((a,b)=>b.roi-a.roi)[0]?.index;
 const budget=readyGroups.some(g=>g.owned===g.ids.length)?Math.min(...readyGroups.filter(g=>g.owned===g.ids.length).map(g=>BOARD[g.ids[0]].build))*.6:0;
 const reserve=options.ablateReserve?2000:Math.ceil(debt+reserved+persona.risk*(360+expectedRisk*1.4+peakRisk+taxRisk*.5+budget)-income*.2);
 const probability=t=>Math.max(.002,.65*steady[t]+.35*(visits.reduce((n,v)=>n+v[t],0)/Math.max(1,others.length*3)));
 return {id,persona,others,own,expectedRisk,peakRisk,income,debt,reserved,reserve:Math.max(360,debt+reserved,reserve),targetGroup,groups:readyGroups,probability,stock:stock(s),phase:BOARD.filter(t=>t.price&&s.assets[t.id].owner===null).length>12?'acquisition':exposure.some(t=>s.assets[t.id].level>=3)?'contested':'development',options};
}
export function groupOption(s,id,index,analysis){
 const g=GROUPS[index];if(!g||!complete(s,id,index))return 0;
 const unbuilt=g.ids.filter(t=>s.assets[t].level<3&&!s.assets[t].mortgaged);if(!unbuilt.length)return 0;
 const cost=unbuilt.reduce((n,t)=>n+(3-s.assets[t].level)*BOARD[t].build,0);
 const income=unbuilt.reduce((n,t)=>n+(BOARD[t].rents[3]-rent(s,t,7))*analysis.probability(t),0)*analysis.others.length*analysis.persona.horizon;
 const finance=clamp(s.players[id].cash/Math.max(1,cost+analysis.reserve*.5),.12,1);
 return Math.max(0,income-cost*.5)*finance*(analysis.stock.houses===0?.25:1);
}
export function portfolioValue(s,id,a){
 const value=assets(s,id).reduce((n,t)=>{const asset=s.assets[t.id];return n+(asset.mortgaged?t.mortgage*.95:t.price*.8)+(t.build||0)*(asset.level||0)*.5+(asset.mortgaged?0:rent(s,t.id,7)*a.probability(t.id)*a.others.length*a.persona.horizon);},0);
 return value+GROUPS.reduce((n,_,index)=>n+groupOption(s,id,index,a),0);
}
export function propertyValue(s,id,tile,a){
 const t=BOARD[tile];if(!t?.price)return 0;
 const before=portfolioValue(s,id,a),next={...s,assets:{...s.assets,[tile]:{...s.assets[tile],owner:id}}};
 let value=portfolioValue(next,id,a)-before;
 if(t.group>=0){const g=GROUPS[t.group],owned=g.ids.filter(i=>s.assets[i].owner===id).length;
  value+=t.price*(owned===g.ids.length-1?.35:owned>0?.18:.08);
  if(a.targetGroup===t.group&&!a.options.ablatePlan)value+=t.price*.18;
  const danger=a.others.filter(p=>g.ids.filter(i=>s.assets[i].owner===p.id).length===g.ids.length-1);
  for(const p of danger){const gain=g.ids.reduce((n,i)=>n+BOARD[i].rents[3]*a.probability(i),0)*a.persona.horizon;
   value+=Math.max(0,gain-g.ids.length*3*t.build*.5)*.3*a.persona.blocking;
  }
 }
 if(a.phase==='acquisition'&&t.type==='city')value+=t.price*.22*a.persona.investment;
 return Math.max(t.mortgage,value);
}
export function liquidityPenalty(cash,reserve){return Math.max(0,reserve-cash)*1.15+Math.max(0,reserve*.35-cash)*1.5;}

/** Public estimate of competing buying power, not a calibrated probability or private plan. */
export function auctionCompetition(s,id,a){
 const auction=s.auction;
 return Math.max(auction.amount||0,...a.others.filter(p=>auction.participants.includes(p.id)&&!auction.passed.includes(p.id)).map(p=>{
  const tile=auction.kind==='building'?auction.targets[p.id]:auction.tile,t=BOARD[tile];
  if(!t)return 0;
  const estimate=auction.kind==='building'?t.build*1.4:propertyValue(s,p.id,tile,analyzeState(s,p.id,a.options));
  const observed=a.options.ablateOpponent?null:s.botMemory?.opponents?.[p.id];
  const confidence=observed?(observed.observations||0)/((observed.observations||0)+8):0;
  const blended=estimate*(1-.3*confidence)+(auction.kind==='building'?t.build:t.price)*(observed?.aggression||1)*.3*confidence;
  return Math.min(p.cash,blended);
 }));
}
