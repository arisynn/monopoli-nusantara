import {BOARD,GROUPS,AUCTION_RULES} from '../content.mjs';
import {managementError,rent,stock,command} from '../game.mjs';
import {economyRules,buildingCashReserve} from './economy.mjs';
const penalty=(cash,reserve)=>Math.max(0,reserve-cash)*1.15+Math.max(0,reserve*.35-cash)*1.5;
const copy=s=>({...s,players:s.players.map(p=>({...p})),assets:Object.fromEntries(Object.entries(s.assets).map(([k,v])=>[k,{...v}]))});
export function allocateDevelopment(input,id,{reserve=0,probability=()=>.025,horizon=24,maxSteps=40,conservative=true}={}){
  const cashFloor=buildingCashReserve({reserve});
  const s=copy(input),originalCash=s.players[id].cash,opponents=s.players.filter(p=>!p.out&&p.id!==id),path=[];
  const personaId=s.players[id]?.botPersona;
  const isSari=personaId==='sari',isRaka=personaId==='raka';
  let gain=0,cost=0,contested=false;
  for(let pass=0;pass<8&&path.length<maxSteps;pass++){
    const options=[];
    for(const g of GROUPS){
      if(!g.ids.every(i=>s.assets[i].owner===id&&!s.assets[i].mortgaged))continue;
      const next=copy(s),actions=[];let spend=0,benefit=0,releasePenalty=0;
      for(let step=0;step<15&&path.length+actions.length<maxSteps;step++){
        const candidates=g.ids.filter(i=>!managementError(next,id,i,'BUILD')).sort((x,y)=>{
          const marginal=i=>{const a=next.assets[i];return (BOARD[i].rents[a.level+1]-rent(next,i,7))*probability(i);};
          return marginal(y)-marginal(x)||x-y;
        });
        const tile=candidates[0];if(tile===undefined)break;
        const a=next.assets[tile],t=BOARD[tile],bank=stock(next),kind=a.level===4?'hotel':'house';
        if(next.players[id].cash-t.build<cashFloor)break;
        const eligible=opponents.filter(p=>p.cash>=AUCTION_RULES.minimum&&BOARD.some(q=>q.type==='city'&&(next.assets[q.id].level===4?'hotel':'house')===kind&&!managementError(next,p.id,q.id,'BUILD',{ignoreCash:true})));
        if(conservative&&eligible.length&&bank[kind==='house'?'houses':'hotels']<=eligible.length+1){contested=true;break;}
        const threeHouseAccel=(isRaka&&a.level<3)?1.18:1.0;
        const marginal=(t.rents[a.level+1]-rent(next,tile,7))*probability(tile)*opponents.length*horizon*threeHouseAccel;
        const scarcityThreshold=isSari?15:9;
        if(a.level===4&&bank.houses<scarcityThreshold){
          const demand=eligible.reduce((n,p)=>n+Math.floor(Math.max(0,p.cash-reserve*.5)/Math.max(1,t.build)),0);
          releasePenalty+=Math.min(4,demand)*t.build*(isSari?1.15:0.70);
        }
        next.players[id].cash-=t.build;a.level++;spend+=t.build;benefit+=marginal;actions.push({type:'BUILD',tile});
        const liquidity=penalty(next.players[id].cash,reserve)-penalty(s.players[id].cash,reserve);
        const value=benefit-spend*.55-liquidity-releasePenalty;
        if(value>0)options.push({state:copy(next),actions:[...actions],cost:spend,gain:benefit,value,efficiency:value/Math.max(1,spend)});
      }
    }
    options.sort((a,b)=>b.efficiency-a.efficiency||b.value-a.value);
    if(!options.length)break;
    const best=options[0];s.assets=best.state.assets;s.players=best.state.players;path.push(...best.actions);gain+=best.gain;cost+=best.cost;
  }
  s.bank=stock(s);
  return {state:s,path,cost,gain,contested,score:gain-cost*.55-(penalty(s.players[id].cash,reserve)-penalty(originalCash,reserve))};
}
export function replayManagement(s,id,path,rng=()=>.413){
  let state=s;const applied=[];
  for(const action of path){
    if(!['roll','end','jail','debt','buy','card'].includes(state.phase))break;
    try{const next=command(state,id,action,rng);applied.push(action);state=next;}catch{break;}
    if(state.phase==='buildOffer'||state.phase==='auction')break;
  }
  return {state,path:applied,complete:applied.length===path.length&&!['buildOffer','auction'].includes(state.phase)};
}
export function postTradeDevelopment(s,ids,options={}){
  const outcomes=[];
  for(const order of [ids,[...ids].reverse()]){
    let next=s;const plans=[];
    for(const id of order){
      const rules=economyRules(next),p=allocateDevelopment(next,id,{reserve:Math.max(rules.floor,options.reserves?.[id]||0),maxSteps:30,...options});
      next=p.state;plans.push({id,cost:p.cost,gain:p.gain,buildings:p.path.length,contested:p.contested});
    }
    outcomes.push({state:next,plans,order});
  }
  return outcomes;
}
