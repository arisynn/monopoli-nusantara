/** Lab-only semantic cycle detection. Excludes event/version churn, includes decisions. */
export const cycleFingerprint=s=>JSON.stringify([s.turnSerial,s.phase,s.turn,s.doubles,s.phase==='starting'?s.starting:null,s.card,s.debt,s.mortgageDecision,s.rentClaims,s.players.map(p=>[p.cash,p.pos,p.out,p.inJail,p.jail,p.cards]),s.assets,s.auction?{amount:s.auction.amount,highest:s.auction.highest,passed:s.auction.passed,targets:s.auction.targets}:null,s.buildOffer,s.trade?{from:s.trade.from,to:s.trade.to,give:s.trade.give,take:s.trade.take,giveCash:s.trade.giveCash,takeCash:s.trade.takeCash}:null]);
/** Evidence gate only: never changes production weights or settings. */
export function promotionGate(report){
 const model=report.byModel?.hardcore,pair=report.paired?.hardcore,reasons=[];
 if(!model||model.games<300)reasons.push('insufficient_held_out_games');
 if(!model||model.illegal!==0)reasons.push('invalid_or_missing_action_results');
 if(!model||model.finished/model.games<.99)reasons.push('finish_rate_below_99_percent');
 if(!pair||!(pair.clusterBootstrap95?.[0]>0))reasons.push('superiority_not_established');
 return {promote:reasons.length===0,reasons,champion:'v4.5 economic policy / default Medium',challenger:'NUSA-X4',automaticProductionChanges:false};
}
