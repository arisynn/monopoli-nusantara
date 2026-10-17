/** NUSA V7.0 — only public state; no neural/checkpoint or private deck reads. */
import {BOARD,GROUPS} from '../../content.mjs';
import {observation} from '../mind.mjs';
import {landingForecast} from '../probability.mjs';
import {stock,rent} from '../../game.mjs';
import {economyRules} from '../economy.mjs';
const mean=(a)=>a.reduce((n,v)=>n+v,0)/Math.max(1,a.length);
export function situationOf(state,actor,plan){
 const view=observation(state,actor),self=view.players[actor];
 if(!self||self.out)throw Error('NUSA V7 actor inactive');
 const rivals=view.players.filter(p=>p.id!==actor&&!p.out);
 const owned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner===actor);
 const unowned=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner==null);
 const bank=stock(view);
 const groups=GROUPS.map((g,i)=>({id:i,ids:g.ids,own:g.ids.filter(t=>view.assets[t]?.owner===actor).length,
  owners:rivals.map(p=>({id:p.id,count:g.ids.filter(t=>view.assets[t]?.owner===p.id).length})),
  complete:g.ids.every(t=>view.assets[t]?.owner===actor&&!view.assets[t]?.mortgaged),
  levelMin:Math.min(...g.ids.map(t=>view.assets[t]?.level||0))}));
 const requiresForecast=plan.candidates.some(c=>['BUY','BID','BUILD','BUILD_JOIN','OFFER','COUNTER','TRADE_ACCEPT','JAIL_PAY','JAIL_CARD','REDEEM','MORTGAGE','SELL','SELL_SET'].includes(c.action.type));
 let visits=Array(40).fill(0),ownVisits=Array(40).fill(0);
 if(requiresForecast){
  for(const p of rivals){const f=landingForecast(view,p.id,2);for(let i=0;i<40;i++)visits[i]+=(f.visits[i]||0);}
  ownVisits=landingForecast(view,actor,1).visits;
 }
 const threat=BOARD.filter(t=>t.price&&view.assets[t.id]?.owner!=null&&view.assets[t.id]?.owner!==actor&&!view.assets[t.id]?.mortgaged);
 const nearLoss=threat.reduce((n,t)=>n+(ownVisits[t.id]||0)*rent(view,t.id,7),0);
 const expectedIncome=owned.filter(t=>!view.assets[t.id].mortgaged).reduce((n,t)=>n+visits[t.id]*rent(view,t.id,7),0);
 const maxThreat=Math.max(0,...threat.map(t=>rent(view,t.id,7)));
 const rules=economyRules(view);
 const reserve=Math.max(rules.floor||0,(plan.summary?.reserve??0),Math.min(self.cash*.65,nearLoss*.9+maxThreat*.13));
 const stage=unowned.length>10?'acquisition':groups.some(g=>g.complete&&g.levelMin<3)?'development':rivals.length<=2?'endgame':'contested';
 const leader=rivals.slice().sort((a,b)=>b.cash-a.cash)[0]||null;
 return Object.freeze({view,actor,self,rivals,owned,unowned,groups,bank,visits,ownVisits,expectedIncome,nearLoss,maxThreat,reserve,stage,leader,
  salary:rules.salary, // authoritative rulepack salary; score units only
  live:view.players.filter(p=>!p.out).length});
}
