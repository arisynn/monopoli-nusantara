/** NUSA V7.0 Strategy Knowledge Bank. All 16 experts are deterministic, read-only,
 * and return comparable bounded utility hints, NOT calibrated win probabilities.
 * Values are advisor contributions, not actions. Council owns action selection.
 */
import {BOARD,GROUPS} from '../../content.mjs';
import {rent} from '../../game.mjs';
const clamp=(x,lo=-1,hi=1)=>Math.max(lo,Math.min(hi,x));
const owner=(c,t)=>c.view.assets[t]?.owner;
const actType=a=>a.type;
const build=a=>['BUILD','BUILD_JOIN'].includes(actType(a));
const acquisition=a=>['BUY','BID'].includes(actType(a));
const tileOf=(c,a)=>a.type==='BUY'?c.view.buy:a.type==='BID'?c.view.auction?.tile:a.tile;
const dollars=(c,a)=>a.type==='BUY'?BOARD[c.view.buy]?.price||0:a.type==='BID'?a.amount||0:build(a)?BOARD[a.tile]?.build||0:a.type==='REDEEM'?BOARD[a.tile]?.mortgage*1.1||0:0;
const delta=(signal,reason)=>({signal:clamp(signal),reason});
const once=(c,t)=>Number.isInteger(t)&&BOARD[t]?.price>0;
function completion(c,t){const board=BOARD[t];if(!board||board.group<0)return 0;
 const g=c.groups[board.group];return owner(c,t)==null&&g.own===g.ids.length-1?1:g.own/g.ids.length*.4;}
function block(c,t){const b=BOARD[t];if(!b||b.group<0)return 0;const g=c.groups[b.group];return owner(c,t)==null&&g.owners.some(o=>o.count===g.ids.length-1)?1:0;}
function capPressure(c,cost){return clamp((c.self.cash-cost-c.reserve)/Math.max(800,c.reserve));}
function rentDelta(c,t){const a=c.view.assets[t],b=BOARD[t];if(!a||!b?.build||a.level>=5)return 0;return Math.max(0,b.rents[a.level+1]-rent(c.view,t,7));}
function valuation(c,t){const p=BOARD[t];if(!p)return 0;
 const synergy=completion(c,t),denial=block(c,t),visits=c.visits[t]||0;
 return p.price*(.8+synergy*.9+denial*.35)+visits*(p.rents?.[0]||200)*2;
}
function exchange(c,a){if(!['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(a.type))return null;
 return a.type==='TRADE_ACCEPT'?c.view.trade:a.trade;}
function candidateOwnerGain(c,trade){if(!trade)return 0;const give=trade.give||[],take=trade.take||[];
 const synergy=take.reduce((n,t)=>n+completion(c,t),0)-give.reduce((n,t)=>n+completion(c,t),0);
 const opponentMonopoly=give.some(t=>{const b=BOARD[t];if(!b||b.group<0)return false;const g=c.groups[b.group];return g.owners.some(o=>o.count===g.ids.length-1);});
 return clamp(synergy*.55-(opponentMonopoly?.9:0));}
const defs=[
 {id:'portfolio',name:'Portfolio Expert',types:['BUY','BID'],assess:(c,a)=>{const t=tileOf(c,a);if(!acquisition(a)||!once(c,t))return null;const v=valuation(c,t),cost=dollars(c,a);return delta((v-cost)/Math.max(v,500),'marginal_portfolio_value');}},
 {id:'completion',name:'Monopoly Completion',types:['BUY','BID'],assess:(c,a)=>{const t=tileOf(c,a);if(!acquisition(a)||!once(c,t))return null;return delta(completion(c,t),'set_completion');}},
 {id:'auction',name:'Auction Expert',types:['BID'],assess:(c,a)=>{if(a.type!=='BID')return null;const t=tileOf(c,a);if(!once(c,t)||c.view.auction?.kind==='building')return null;
  const val=valuation(c,t);return delta((val-a.amount)/Math.max(val,1)*.6,'auction_bid_surplus');}},
 {id:'blocking',name:'Blocking Expert',types:['BUY','BID'],assess:(c,a)=>{if(!acquisition(a))return null;return delta(block(c,tileOf(c,a)),'denial_value');}},
 {id:'development',name:'Development Expert',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{if(!build(a))return null;
  const v=rentDelta(c,a.tile)*(c.visits[a.tile]||0);return delta(v/Math.max(200,dollars(c,a)),'marginal_house_rent');}},
 {id:'scarcity',name:'Housing Scarcity',types:['BUILD','BUILD_JOIN'],assess:(c,a)=>{if(!build(a))return null;const lv=c.view.assets[a.tile]?.level,oppDemand=c.groups.some(g=>g.owners.some(o=>o.count===g.ids.length));
  const scarcity=(c.bank.houses<=10&&oppDemand)?clamp((12-c.bank.houses)/12):0;
  return delta(lv===3?scarcity:lv===4?-scarcity:0,'physical_house_denial');}},
 {id:'cashflow',name:'Cashflow Expert',types:['BUILD','BUY','BID'],assess:(c,a)=>{if(!(build(a)||acquisition(a)))return null;
  const t=tileOf(c,a);if(!once(c,t))return null;
  const opportunity=build(a)?rentDelta(c,t):(BOARD[t].rents?.[0]||50),income=opportunity*(c.visits[t]||0);
  return delta(income/Math.max(250,dollars(c,a)),'expected_rent_cashflow');}},
 {id:'liquidity',name:'Liquidity Expert',types:['BUY','BID','BUILD','BUILD_JOIN','REDEEM'],assess:(c,a)=>{if(!(build(a)||acquisition(a)||a.type==='REDEEM'))return null;
  const remaining=c.self.cash-dollars(c,a),shortage=c.reserve-remaining;
  return delta(shortage>0?-shortage/Math.max(300,c.reserve):.10,'post_spend_liquidity');}},
 {id:'mortgage',name:'Mortgage Expert',types:['MORTGAGE','REDEEM','SELL','SELL_SET'],assess:(c,a)=>{if(!['MORTGAGE','REDEEM','SELL','SELL_SET'].includes(a.type))return null;
  const t=a.tile,net=c.visits[t]*rent(c.view,t,7),group=BOARD[t]?.group;
  const essential=group>=0&&c.groups[group].complete;
  return delta(a.type==='REDEEM'?(essential?.7:.2)+net/Math.max(200,c.salary):-(essential?.7:.1)-net/Math.max(200,c.salary),'mortgage_portfolio_loss');}},
 {id:'probability',name:'Probability Expert',types:['BUILD','BUY','BID'],assess:(c,a)=>{if(!(build(a)||acquisition(a)))return null;
  const t=tileOf(c,a);if(!once(c,t))return null;
  return delta((c.visits[t]||0)*1.3,'public_landing_probability');}},
 {id:'jail',name:'Jail Expert',types:['JAIL_PAY','JAIL_CARD'],assess:(c,a)=>{if(!['JAIL_PAY','JAIL_CARD'].includes(a.type))return null;
  const future=c.unowned.length*30,exposure=c.nearLoss,penalty=a.type==='JAIL_PAY'?500:220;
  return delta((future-exposure-penalty)/Math.max(500,c.salary),'jail_exit_opportunity');}},
 {id:'bankruptcy',name:'Bankruptcy Defense',types:['MORTGAGE','SELL','SELL_SET','BANKRUPT'],assess:(c,a)=>{if(!['MORTGAGE','SELL','SELL_SET','BANKRUPT'].includes(a.type))return null;
  if(c.view.phase!=='debt')return null;return delta(a.type==='BANKRUPT'?-1: a.type==='MORTGAGE'?.5:.2,'debt_rescue_options');}},
 {id:'negotiation',name:'Negotiation Expert',types:['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'],assess:(c,a)=>{const trade=exchange(c,a);if(!trade)return null;
  return delta(candidateOwnerGain(c,trade),'relative_trade_advantage');}},
 {id:'opponent',name:'Opponent Analyst',types:['BUY','BID','OFFER','COUNTER'],assess:(c,a)=>{if(!['BUY','BID','OFFER','COUNTER'].includes(a.type))return null;
  if(acquisition(a))return delta(block(c,tileOf(c,a))*.6,'rival_monopoly_threat');
  const t=exchange(c,a);return delta(candidateOwnerGain(c,t)*.5,'opponent_benefit_penalty');}},
 {id:'endgame',name:'Endgame Expert',types:['BUILD','BUILD_JOIN','REDEEM','MORTGAGE'],assess:(c,a)=>{if(c.live>3||!['BUILD','BUILD_JOIN','REDEEM','MORTGAGE'].includes(a.type))return null;
  return delta(a.type==='MORTGAGE'?-.4:build(a)?capPressure(c,dollars(c,a))*.5:.3,'endgame_cash_survival');}},
 {id:'competitive',name:'Competitive Strategy',types:['BUILD','BUILD_JOIN','BUY','BID','REDEEM'],assess:(c,a)=>{if(!(build(a)||acquisition(a)||a.type==='REDEEM'))return null;
  const factor=c.stage==='acquisition'?(acquisition(a)?.3:-.05):c.stage==='development'?(build(a)?.25:0):c.stage==='endgame'?(capPressure(c,dollars(c,a))*.25):0;
  return delta(factor,'game_stage_priority');}},
];
export const STRATEGY_EXPERTS=Object.freeze(defs.map(d=>Object.freeze(d)));
export function runExperts(context,action){return STRATEGY_EXPERTS.flatMap(x=>{const r=x.assess(context,action);if(!r||!Number.isFinite(r.signal))return [];return [{id:x.id,name:x.name,...r}];});}
