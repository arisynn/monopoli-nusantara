import {BOARD} from './content.mjs';
import {financeLabels} from './finance.mjs';

export const BANK_RECENT_LIMIT=40;
const totalCash=s=>s.players.reduce((sum,p)=>sum+p.cash,0);
export function createBankEconomy(s,{complete=false}={}){
 return {schema:1,complete,fromVersion:s.version,fromRound:s.round,openingCirculation:totalCash(s),issued:0,absorbed:0,transferred:0,turnover:0,count:0,byKind:{},recent:[]};
}
/** Called only when the authoritative reducer commits a public finance event.
 * No reconstruction from the capped log or from balance differences. */
export function recordBankFinance(s,event){
 const bank=s.bankEconomy;if(!bank)return;
 for(const [index,t] of (event.finance||[]).entries()){
  if(!Object.hasOwn(financeLabels,t.kind)||!Number.isSafeInteger(t.amount)||t.amount<=0)continue;
  const issued=t.from===null&&Number.isInteger(t.to)?t.amount:0;
  const absorbed=t.to===null&&Number.isInteger(t.from)?t.amount:0;
  const transferred=Number.isInteger(t.from)&&Number.isInteger(t.to)?t.amount:0;
  if(!issued&&!absorbed&&!transferred)continue;
  bank.issued+=issued;bank.absorbed+=absorbed;bank.transferred+=transferred;bank.turnover+=t.amount;bank.count++;
  const row=bank.byKind[t.kind]||={issued:0,absorbed:0,transferred:0,total:0,count:0};
  row.issued+=issued;row.absorbed+=absorbed;row.transferred+=transferred;row.total+=t.amount;row.count++;
  bank.recent.unshift({id:`${event.id}:${index}`,round:event.turn,kind:t.kind,from:t.from,to:t.to,amount:t.amount,...(Number.isInteger(t.tile)?{tile:t.tile}:{})});
 }
 bank.recent=bank.recent.slice(0,BANK_RECENT_LIMIT);
}
/** Current public balances/ownership remain the source of truth for snapshots. */
export function bankSnapshot(s){
 const ledger=s.bankEconomy||createBankEconomy(s);
 const properties=BOARD.filter(t=>t.price),mortgaged=properties.filter(t=>s.assets[t.id]?.mortgaged&&s.assets[t.id].owner!==null);
 return {circulation:totalCash(s),ledger,mortgaged:mortgaged.map(t=>({tile:t.id,owner:s.assets[t.id].owner,principal:t.mortgage,redemption:t.mortgage+Math.ceil(t.mortgage/10)})),mortgagePrincipal:mortgaged.reduce((n,t)=>n+t.mortgage,0),unowned:properties.filter(t=>s.assets[t.id]?.owner===null).map(t=>t.id),houses:s.bank.houses,hotels:s.bank.hotels};
}
