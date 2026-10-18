import {BOARD,GROUPS} from '../content.mjs';
import {managementError,rent} from '../game.mjs';
import {allocateDevelopment,replayManagement} from './allocation.mjs';
import {economyRules,buildingCashReserve} from './economy.mjs';

/** Compare finance -> even development routes. These are economic alternatives,
 * not new gameplay commands: only the first legal edge is ever dispatched. */
export function developmentRoutes(s,id,a){
 if(!['roll','end','jail'].includes(s.phase))return [];
 const routes=[];
 const allocation=allocateDevelopment(s,id,{reserve:a.reserve,probability:a.probability,horizon:a.persona.horizon,expired:()=>a.options.context?.expired()||false});
 if(allocation.path.length){const verified=replayManagement(s,id,allocation.path);
  if(verified.path.length)routes.push({group:'multi',groupIndex:BOARD[allocation.path[0].tile].group,first:allocation.path[0],path:verified.path,funding:[],buildCost:allocation.cost,expectedRentGain:allocation.gain,score:allocation.score/Math.max(1,allocation.path.length)*.4});
 }
 const rules=economyRules(s);
 for(const g of GROUPS){
  if(a.options.context?.expired())break;
  if(!g.ids.every(i=>s.assets[i].owner===id&&!s.assets[i].mortgaged)||g.ids.some(i=>s.assets[i].level>=3))continue;
  const neededHouses=g.ids.reduce((n,i)=>n+3-s.assets[i].level,0);if(a.stock.houses<neededHouses)continue;
  const cost=g.ids.reduce((n,i)=>n+(3-s.assets[i].level)*BOARD[i].build,0);
  const rentGain=g.ids.reduce((n,i)=>n+(BOARD[i].rents[3]-rent(s,i,7))*a.probability(i),0)*a.others.length*a.persona.horizon;
  const shortfall=cost+Math.max(buildingCashReserve(a),Math.min(a.reserve*.55,rules.salary*.9))-s.players[id].cash;
  if(shortfall<=0||rentGain<cost*1.1)continue;
  const collateral=BOARD.filter(t=>s.assets[t.id]?.owner===id&&t.group!==BOARD[g.ids[0]].group&&(!GROUPS[t.group]||!GROUPS[t.group].ids.every(i=>s.assets[i].owner===id))&&!managementError(s,id,t.id,'MORTGAGE'))
   .map(t=>({tile:t.id,cash:t.mortgage,loss:Math.max(0,t.price*.8-t.mortgage*.95-t.mortgage)+rent(s,t.id,7)*a.probability(t.id)*a.others.length*a.persona.horizon}))
   .sort((x,y)=>x.loss/x.cash-y.loss/y.cash);
  let raised=0,loss=0;const funding=[];
  for(const item of collateral){funding.push(item.tile);raised+=item.cash;loss+=item.loss;if(raised>=shortfall)break;}
  const benefit=rentGain-cost-loss;
  if(raised<shortfall||benefit<cost*.3||!funding.length)continue;
  const finance=funding.map(tile=>({type:'MORTGAGE',tile})),funded=replayManagement(s,id,finance);
  if(!funded.complete)continue;
  const builds=allocateDevelopment(funded.state,id,{reserve:Math.min(a.reserve*.55,rules.salary*.9),probability:a.probability,horizon:a.persona.horizon,expired:()=>a.options.context?.expired()||false});
  if(!builds.path.length)continue;
  routes.push({group:g.name,groupIndex:BOARD[g.ids[0]].group,first:finance[0],path:[...finance,...builds.path],funding,buildCost:cost,expectedRentGain:rentGain,benefit,score:benefit/Math.max(1,g.ids.reduce((n,i)=>n+3-s.assets[i].level,0)+funding.length)*.4});
 }
 return routes.sort((x,y)=>y.score-x.score);
}
