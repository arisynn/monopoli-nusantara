/** NUSA V11.0 Sovereign Grandmaster — Public-state strategic telemetry,
 * dual-horizon 1-roll ambush radar, flash-build shortfall analyzer,
 * and KRESNA V2.0 / 6-Persona counter-profiling.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {observation} from '../mind.mjs';
import {landingForecast} from '../probability.mjs';
import {stock,rent,redemption} from '../../game.mjs';
import {economyRules,strengthShares} from '../economy.mjs';

export function situationOf(state,actor,plan){
  const view=observation(state,actor),self=view.players[actor];
  if(!self||self.out)throw Error('NUSA V11 actor inactive');
  const rivals=view.players.filter(p=>p.id!==actor&&!p.out);
  const owned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===actor);
  const unowned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner==null);
  const bank=stock(view);
  const groups=GROUPS.map((g,i)=>({
    id:i,
    ids:g.ids,
    own:g.ids.filter(t=>view.assets[t]?.owner===actor).length,
    unownedCount:g.ids.filter(t=>view.assets[t]?.owner==null).length,
    owners:rivals.map(p=>({id:p.id,persona:p.botPersona||'human',count:g.ids.filter(t=>view.assets[t]?.owner===p.id).length})),
    complete:g.ids.every(t=>view.assets[t]?.owner===actor&&!view.assets[t]?.mortgaged),
    mortgagedCount:g.ids.filter(t=>view.assets[t]?.owner===actor&&view.assets[t]?.mortgaged).length,
    fullSetOwned:g.ids.every(t=>view.assets[t]?.owner===actor),
    levelMin:Math.min(...g.ids.map(t=>view.assets[t]?.level||0)),
    levelMax:Math.max(...g.ids.map(t=>view.assets[t]?.level||0)),
    redeemCost:g.ids.filter(t=>view.assets[t]?.owner===actor&&view.assets[t]?.mortgaged).reduce((n,t)=>n+redemption(t),0),
    houseCost:BOARD[g.ids[0]]?.build||1000
  }));

  let visits=Array(40).fill(0),immediateVisits=Array(40).fill(0),ownVisits=Array(40).fill(0);
  for(const p of rivals){
    const f1=landingForecast(view,p.id,1);
    const f2=landingForecast(view,p.id,2);
    for(let i=0;i<40;i++){
      immediateVisits[i]+=(f1.visits[i]||0);
      visits[i]+=(f2.visits[i]||0)*0.62+(f1.visits[i]||0)*0.38;
    }
  }
  ownVisits=landingForecast(view,actor,1).visits;

  const threat=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner!=null&&view.assets[t.id]?.owner!==actor&&!view.assets[t.id]?.mortgaged);
  const nearLoss=threat.reduce((n,t)=>n+(ownVisits[t.id]||0)*rent(view,t.id,7),0);
  const expectedIncome=owned.filter(t=>!view.assets[t.id].mortgaged).reduce((n,t)=>n+visits[t.id]*rent(view,t.id,7),0);
  const maxThreat=Math.max(0,...threat.filter(t=>(ownVisits[t.id]||0)>0.015).map(t=>rent(view,t.id,7)));
  const rules=economyRules(view);

  const isolatedMortgageable=owned
    .filter(t=>!view.assets[t.id]?.mortgaged&&(t.group<0||!groups[t.group].fullSetOwned)&&(view.assets[t.id]?.level||0)===0);
  const liquidBuffer=isolatedMortgageable.reduce((n,t)=>n+(t.mortgage||0),0);

  const rawReserve=Math.max(
    rules.floor||0,
    nearLoss*0.90+maxThreat*0.12-liquidBuffer*0.55
  );
  const reserve=Math.max(rules.floor||0,Math.min(self.cash*0.48,rawReserve));

  const shares=strengthShares(view,BOARD,GROUPS,rent);
  const leader=rivals.slice().sort((a,b)=>(shares[b.id]-shares[a.id])||(b.cash-a.cash))[0]||null;
  const nemesis=rivals.find(p=>p.botPersona==='kresna')||leader;
  const sariPresent=rivals.some(p=>p.botPersona==='sari');
  const rivalMonopolies=rivals.filter(p=>GROUPS.some(g=>g.ids.every(id=>view.assets[id]?.owner===p.id))).length;
  const needsBuildCapital=groups.some(g=>(g.complete&&g.levelMin<3)||(g.fullSetOwned&&g.mortgagedCount>0));
  const stage=unowned.length>9?'acquisition':needsBuildCapital?'development':rivals.length<=2?'endgame':'contested';

  return Object.freeze({
    view,actor,self,rivals,owned,unowned,groups,bank,
    visits,immediateVisits,ownVisits,expectedIncome,nearLoss,maxThreat,
    isolatedMortgageable,liquidBuffer,reserve,stage,leader,nemesis,sariPresent,
    shares,rivalMonopolies,needsBuildCapital,
    salary:rules.salary,
    live:view.players.filter(p=>!p.out).length
  });
}
