/** NUSA V7.0 — deterministic Expert Council, only ranks existing legal actions.
 * No search or learning here: those belong to V7.1 and are explicitly disabled.
 */
import {legalCandidate} from '../candidates.mjs';
import {situationOf} from './situation.mjs';
import {runExperts,STRATEGY_EXPERTS} from './experts.mjs';
export const NUSA_V7_VERSION='7.0.0-foundation';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const building=a=>['BUILD','BUILD_JOIN'].includes(a?.type);
const protectedType=a=>['CLAIM_RENT','PAY','START_ROLL','ACK','BANKRUPT'].includes(a?.type);
function compatible(base,action,phase){
 if(eq(base,action))return true;
 if(phase==='debt'||phase==='buildOffer')return false;
 if(phase==='buy')return base.type===action.type; // no BUY->AUCTION regression
 if(phase==='auction')return base.type===action.type; // BID amounts only, never BID->PASS
 if(building(base)||building(action))return building(base)&&building(action); // never cancel good build
 if(['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(base.type)||['OFFER','COUNTER','TRADE_ACCEPT','TRADE_REJECT'].includes(action.type))
   return base.type===action.type; // no fake acceptances
 if(['JAIL_PAY','JAIL_CARD'].includes(base.type)||['JAIL_PAY','JAIL_CARD'].includes(action.type))return base.type===action.type;
 return base.type===action.type;
}
export function nusaV7Decision(state,actor,plan,{diagnostics=false,disabled=[]}={}){
 const base=plan?.action, candidates=plan?.candidates||[];
 const fallback=(reason,extra={})=>({action:base??null,changed:false,reason,...extra});
 if(!base||candidates.length<2||protectedType(base)||candidates[0].score>=1e6)return fallback('protected_or_trivial');
 if(!['auction','buy','roll','end','trade','jail'].includes(state.phase))return fallback('protected_phase');
 const context=situationOf(state,actor,plan);const salary=context.salary;
 const allowed=new Set(STRATEGY_EXPERTS.map(x=>x.id));
 if(disabled.some(id=>!allowed.has(id)))throw Error('Unknown NUSA expert ablation: '+disabled.find(id=>!allowed.has(id)));
 const eligible=candidates.filter(c=>compatible(base,c.action,state.phase));
 if(eligible.length<2)return fallback('no_compatible_alternative');
 const ranked=eligible.map(c=>{
   const signals=runExperts(context,c.action).filter(s=>!disabled.includes(s.id));
   const active=signals.length;
   const advisory=active?signals.reduce((sum,s)=>sum+s.signal,0)/Math.sqrt(active):0;
   // Capped normalized influence: cannot ignore a substantial native economic loss.
   const bonus=Math.max(-salary*.075,Math.min(salary*.075,advisory*salary*.045));
   return {...c,bonus,advisory,signals,unified:c.score+bonus};
 }).sort((x,y)=>y.unified-x.unified||x.id.localeCompare(y.id));
 const current=ranked.find(c=>eq(c.action,base));if(!current)return fallback('baseline_not_ranked');
 const best=ranked[0];
 const improvement=best.unified-current.unified;
 const changeAllowed=!eq(best.action,base)&&improvement>Math.max(15,salary*.008)&&
   best.score>=current.score-salary*.065 && legalCandidate(context.view,actor,best.action);
 const result={action:changeAllowed?best.action:base,changed:changeAllowed,
   reason:changeAllowed?'expert_council_selected':'native_plan_preserved'};
 if(diagnostics){
   result.context={stage:context.stage,live:context.live,unowned:context.unowned.length,bankHouses:context.bank.houses,reserve:Math.round(context.reserve)};
   result.proposals=ranked.slice(0,8).map(c=>({id:c.id,type:c.action.type,score:+c.score.toFixed(2),unified:+c.unified.toFixed(2),
     signals:c.signals.map(s=>({expert:s.id,signal:+s.signal.toFixed(3),reason:s.reason}))}));
   result.expertCount=STRATEGY_EXPERTS.length;
   result.expertCoverage=Object.fromEntries(STRATEGY_EXPERTS.map(e=>[e.id,ranked.reduce((n,c)=>n+Number(c.signals.some(x=>x.id===e.id)),0)]));
   result.candidateCount=candidates.length;result.eligibleCount=eligible.length;
   // Decision-level leave-one-out screening reuses the *same* public-state
   // assessments: no additional game simulator, no hidden cards, no learning.
   // 'change' means only different recommendation on this state, NOT uplift.
   result.leaveOneOut=Object.fromEntries(STRATEGY_EXPERTS.map(expert=>{
     const originalAction=result.action;
     const pool=ranked.map(c=>{
       const without=c.signals.filter(signal=>signal.id!==expert.id);
       const advisory=without.length?without.reduce((sum,signal)=>sum+signal.signal,0)/Math.sqrt(without.length):0;
       const bonus=Math.max(-salary*.075,Math.min(salary*.075,advisory*salary*.045));
       return {...c,unified:c.score+bonus};
     }).sort((a,b)=>b.unified-a.unified||a.id.localeCompare(b.id));
     const fallback=pool.find(c=>eq(c.action,base)),leader=pool[0];
     const legal=leader&&fallback&&!eq(leader.action,base)&&
       leader.unified-fallback.unified>Math.max(15,salary*.008)&&
       leader.score>=fallback.score-salary*.065&&legalCandidate(context.view,actor,leader.action);
     const predicted=legal?leader.action:base;
     return [expert.id,{activeCandidates:ranked.filter(c=>c.signals.some(x=>x.id===expert.id)).length,
       changesDecision:!eq(predicted,originalAction),changesRanking:!eq(leader.action,best.action)}];
   }));
 }
 return result;
}
