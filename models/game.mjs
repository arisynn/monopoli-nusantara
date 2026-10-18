// Compatibility bridge: game rules are imported exclusively from ../engine/.
// The historical baseline candidate generator belongs to models, not rules.
export * from '../engine/index.mjs';
import {BOARD,GROUPS,assets,buildTargets,managementError,redemption,command} from '../engine/index.mjs';
import {AUCTION_RULES,auctionMinimum} from '../engine/lib/content.mjs';
const spendable=(s,id)=>s.players[id].cash-(s.auction?.highest===id?s.auction.amount:0);
export function botCandidates(s,id){if(s.schemaVersion!==2)throw Error('Bench models: schema 2 only');const p=s.players[id],actions=[];const add=(type,data={})=>actions.push({type,...data});
 if(['roll','end','jail','buy','card'].includes(s.phase)){const claim=s.rentClaims.find(c=>c.to===id);if(claim)add('CLAIM_RENT',{claimId:claim.id})}
 if(s.phase==='starting'&&s.starting.pending[0]===id)add('START_ROLL');
 if(s.phase==='buildOffer'&&s.buildOffer.pending.includes(id)){for(const tile of buildTargets(s,id,s.buildOffer.kind))add('BUILD_JOIN',{tile});add('BUILD_DECLINE')}
 if(s.phase==='mortgage'&&s.mortgageDecision.player===id){const tile=s.mortgageDecision.tile;if(spendable(s,id)>=redemption(tile))add('MORTGAGE_REDEEM');add('MORTGAGE_KEEP')}
 if(s.phase==='buy'&&s.turn===id){if(p.cash>=BOARD[s.buy].price)add('BUY');add('AUCTION')}
 if(s.phase==='auction'&&s.auction.participants.includes(id)){const amount=auctionMinimum(s.auction);if(p.cash>=amount&&(s.auction.kind!=='building'||buildTargets(s,id,s.auction.building).includes(s.auction.targets[id])))add('BID',{amount});if(s.auction.highest!==id)add('PASS')}
 if(s.phase==='card'&&s.card.player===id)add('ACK');
 if(s.phase==='jail'&&s.turn===id){add('ROLL');if(p.cash>=500)add('JAIL_PAY');if(p.cards.length)add('JAIL_CARD')}
 if(s.phase==='roll'&&s.turn===id)add('ROLL');if(s.phase==='end'&&s.turn===id)add('END');
 if(s.phase==='debt'&&s.debt.from===id){if(p.cash>=s.debt.amount)add('PAY');for(const t of assets(s,id))for(const type of ['SELL','SELL_SET','MORTGAGE'])if(!managementError(s,id,t.id,type))add(type,{tile:t.id});if(actions.length===0)add('BANKRUPT')}
 if(['roll','end'].includes(s.phase)&&id===s.turn){for(const t of assets(s,id))for(const type of ['BUILD','REDEEM'])if(!managementError(s,id,t.id,type)&&p.cash>(t.build||redemption(t.id))+2000)add(type,{tile:t.id})}
 if(s.phase==='end'&&id===s.turn&&p.lastOfferRound!==s.round){for(const group of GROUPS){const owned=group.ids.filter(i=>s.assets[i].owner===id),missing=group.ids.find(i=>s.assets[i].owner!==id);if(owned.length===group.ids.length-1&&missing!==undefined&&s.assets[missing].owner!==null&&!s.assets[missing].mortgaged&&group.ids.every(i=>s.assets[i].level===0)&&p.cash>BOARD[missing].price*1.3+2200){add('OFFER',{trade:{to:s.assets[missing].owner,give:[],take:[missing],giveCash:Math.ceil(BOARD[missing].price*1.3),takeCash:0,giveCards:0,takeCards:0}});break}}}
 if(s.phase==='trade'&&s.trade.to===id){try{command(s,id,{type:'TRADE_ACCEPT',expectedVersion:s.version});add('TRADE_ACCEPT')}catch{}add('TRADE_REJECT')}
 return actions.map((a,i)=>({...a,actionId:`a${i}`}))
}
export function chooseBot(s,id){if(s.schemaVersion!==2)throw Error('Bench models: schema 2 only');const actions=botCandidates(s,id),p=s.players[id],get=type=>actions.find(a=>a.type===type);if(get('CLAIM_RENT'))return get('CLAIM_RENT');
 if(s.phase==='buy')return (p.cash-BOARD[s.buy].price>(s.difficulty==='pemula'?2400:1200)?get('BUY'):null)||get('AUCTION');
 if(s.phase==='auction'){const a=s.auction,t=a.kind==='building'?BOARD[a.targets[id]]:BOARD[a.tile],limit=a.kind==='building'?t.build*1.8:t.price*(assets(s,id).some(x=>x.group===t.group&&x.group>=0)?1.3:.9);return auctionMinimum(a)<=Math.min(limit,p.cash-1000)?get('BID')||get('PASS'):get('PASS')}
 if(s.phase==='buildOffer')return p.cash>2500?get('BUILD_JOIN')||get('BUILD_DECLINE'):get('BUILD_DECLINE');
 if(s.phase==='mortgage')return p.cash-redemption(s.mortgageDecision.tile)>1800?get('MORTGAGE_REDEEM')||get('MORTGAGE_KEEP'):get('MORTGAGE_KEEP');
 if(s.phase==='jail')return get('JAIL_CARD')||(assets(s,id).length<7&&p.cash>1800?get('JAIL_PAY'):null)||get('ROLL');
 if(s.phase==='trade'){const t=s.trade,value=ids=>ids.reduce((n,i)=>n+(s.assets[i].mortgaged?BOARD[i].mortgage:BOARD[i].price),0);return value(t.give)+t.giveCash+500*t.giveCards>=value(t.take)+t.takeCash+500*t.takeCards?get('TRADE_ACCEPT')||get('TRADE_REJECT'):get('TRADE_REJECT')}
 return get('PAY')||get('SELL')||get('SELL_SET')||get('MORTGAGE')||get('BUILD')||get('REDEEM')||get('OFFER')||actions[0]
}
