import {BOARD,GROUPS} from '../content.mjs';
import {command,managementError,assets} from '../game.mjs';
import {portfolioValue} from './analysis.mjs';
import {ruleState} from './candidates.mjs';

/** Exact 0/1 mortgage subset against an additive opportunity-loss objective.
 * This subsolver does not claim global optimality over sales/hotel sequences. */
export function mortgageSubset(s,id,target,analysis,{maxStates=12000,expired=()=>false}={}){
 const need=target-s.players[id].cash;if(need<=0)return {path:[],exact:true};
 const choices=assets(s,id).filter(t=>!managementError(s,id,t.id,'MORTGAGE'));
 let dp=new Map([[0,{raised:0,damage:0,path:[]}]]);
 for(const t of choices){
  if(expired())return null;
  const damage=Math.max(0,t.price*.8-t.mortgage*.95-t.mortgage+rentEstimate(s,t.id)*analysis.probability(t.id)*analysis.others.length*analysis.persona.horizon);
  const next=new Map(dp);
  for(const [cash,node] of dp){
   const raised=node.raised+t.mortgage,key=Math.min(need,raised),path=[...node.path,{type:'MORTGAGE',tile:t.id}],loss=node.damage+damage;
   const candidate={raised,damage:loss,path},old=next.get(key),objective=x=>x.damage+Math.max(0,x.raised-need)*.015+x.path.length*.05;
   if(!old||objective(candidate)<objective(old))next.set(key,candidate);
  }
  if(next.size>maxStates)return null;dp=next;
 }
 const best=dp.get(need);return best?{...best,exact:true,objective:'additive-mortgage-opportunity-loss'}:null;
}

/** Bounded best-first rescue. State dedup prevents the same mortgage subset from
 * consuming the budget in every permutation. Every edge uses the real engine. */
export function rescuePlan(s,id,analysis,{maxNodes=160,maxDepth=40,timeBudgetMs=Infinity,clock=()=>performance.now(),shouldStop=()=>false}={}){
 const started=clock(),expired=()=>shouldStop()||clock()-started>=timeBudgetMs;
 const target=s.debt?.from===id?s.debt.amount:0;
 if(!target||s.players[id].cash>=target)return null;
 const baseValue=portfolioValue(s,id,analysis),initialCash=s.players[id].cash;
 const signature=state=>JSON.stringify(assets(state,id).map(t=>[t.id,state.assets[t.id].level,state.assets[t.id].mortgaged]));
 const initial=ruleState({...s,log:[],seen:[]});
 const queue=[{state:initial,path:[],loss:0,priority:0}],seen=new Map([[signature(s),0]]);let best=null,nodes=0;
 // Seed a complete rescue before exploring permutations. A portfolio requiring
 // six mortgages must not fail because the optimality search was four edges deep.
 let greedy=initial;const greedyPath=[];
 // Safety pass has its own bound (at most 8 set sales + 28 mortgages). A zero
 // optimization budget cannot erase an already reachable survival route.
 for(let depth=0;depth<Math.max(64,maxDepth)&&greedy.players[id].cash<target;depth++){
  const options=[],groups=new Set();
  for(const t of assets(greedy,id))for(const type of ['MORTGAGE','SELL','SELL_SET']){
   if(type==='SELL_SET'){if(groups.has(t.group))continue;groups.add(t.group);}
   if(managementError(greedy,id,t.id,type))continue;
   const a=greedy.assets[t.id],ids=type==='SELL_SET'?GROUPS[t.group].ids:[t.id];
   const gain=type==='MORTGAGE'?t.mortgage:ids.reduce((n,i)=>n+BOARD[i].build*(type==='SELL_SET'?greedy.assets[i].level:1)/2,0);
   const future=ids.reduce((n,i)=>{const tile=BOARD[i],level=greedy.assets[i].level,current=rentEstimate(greedy,i),after=type==='MORTGAGE'||type==='SELL_SET'?0:tile.rents[Math.max(0,level-1)];return n+Math.max(0,current-after)*analysis.probability(i)*analysis.others.length*analysis.persona.horizon;},0);
   options.push({action:{type,tile:t.id},priority:future/Math.max(1,gain)+(type==='MORTGAGE'?0:.1),gain});
  }
  options.sort((a,b)=>a.priority-b.priority||a.gain-b.gain);if(!options.length)break;
  const action=options[0].action;greedy=command(greedy,id,action,()=>.413);nodes++;greedyPath.push(action);
 }
 if(greedy.players[id].cash>=target){const raised=greedy.players[id].cash-initialCash,loss=Math.max(0,baseValue-portfolioValue(greedy,id,analysis)-raised);best={path:greedyPath,raised,loss,objective:loss+Math.max(0,greedy.players[id].cash-target)*.015+greedyPath.length*.05};}
 const subset=expired()?null:mortgageSubset(initial,id,target,analysis,{expired});
 if(subset){let next=initial;try{for(const action of subset.path)next=command(next,id,action,()=>.413);
  const raised=next.players[id].cash-initialCash,loss=Math.max(0,baseValue-portfolioValue(next,id,analysis)-raised),objective=loss+Math.max(0,next.players[id].cash-target)*.015+subset.path.length*.05;
  if(!best||objective<best.objective)best={path:subset.path,raised,loss,objective,solver:'mortgage-subset-dp'};
 }catch{/* The validated safety route remains available. */}}
 while(queue.length&&nodes<maxNodes&&!expired()){
  queue.sort((a,b)=>a.priority-b.priority||a.loss-b.loss||a.path.length-b.path.length);
  const node=queue.shift();if(node.path.length>=maxDepth)continue;
  const groups=new Set(),options=[];
  for(const t of assets(node.state,id))for(const type of ['MORTGAGE','SELL','SELL_SET']){
   if(type==='SELL_SET'){if(groups.has(t.group))continue;groups.add(t.group);}
   if(!managementError(node.state,id,t.id,type))options.push({type,tile:t.id});
  }
  // Test cheap liquidity first, but compare complete rescue cost before choosing.
  options.sort((a,b)=>(a.type==='MORTGAGE'?0:1)-(b.type==='MORTGAGE'?0:1)||BOARD[a.tile].price-BOARD[b.tile].price);
  for(const action of options){
   if(nodes++>=maxNodes||expired())break;
   const next=command(node.state,id,action,()=>.413),raised=next.players[id].cash-initialCash;
   if(raised<=0)continue;
   const loss=Math.max(0,baseValue-portfolioValue(next,id,analysis)-raised),path=[...node.path,action],key=signature(next);
   if(seen.has(key)&&seen.get(key)<=loss)continue;seen.set(key,loss);
   if(next.players[id].cash>=target){
    const objective=loss+Math.max(0,next.players[id].cash-target)*.015+path.length*.05;
    if(!best||objective<best.objective)best={path,loss,raised,objective};continue;
   }
   if(best&&loss>=best.objective)continue;
   queue.push({state:next,path,loss,priority:loss/Math.max(1,raised)*(target-initialCash)+path.length*.05});
  }
  // Breadth is bounded independently of the potentially large property portfolio.
  if(queue.length>48){queue.sort((a,b)=>a.priority-b.priority);queue.length=48;}
 }
 if(best)return {...best,nodes,complete:true,solver:best.solver||'legal-survival-with-bounded-refinement',budgetExhausted:expired()||nodes>=maxNodes};
 // When the full rescue exceeds the search budget, preserve progress: never
 // declare bankruptcy merely because a short search failed to find a path.
 return null;
}
function rentEstimate(s,tile){const t=BOARD[tile],a=s.assets[tile];if(a.mortgaged)return 0;if(t.type==='city')return t.rents[a.level]*(a.level===0&&GROUPS[t.group].ids.every(i=>s.assets[i].owner===a.owner)?2:1);if(t.type==='station')return 250*2**(BOARD.filter(q=>q.type==='station'&&s.assets[q.id].owner===a.owner).length-1);return BOARD.filter(q=>q.type==='utility'&&s.assets[q.id].owner===a.owner).length===2?700:280;}
