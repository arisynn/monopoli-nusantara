import {decisionActor,managementError,redemption,assets,buildTargets,canManage,canTrade} from '../lib/game.mjs';
import {BOARD,money,AUCTION_RULES} from '../lib/content.mjs';
import {gameplayDecision,canPresentDecision} from '../lib/gameplay-presentation.mjs';
import {liveCardDecision} from '../lib/presentation-timeline.mjs';
export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function humanSeat(s,room){if(room)return room.seat;const humans=s?.players.filter(p=>p.controller==='human')||[];const actor=s?decisionActor(s):null;return humans.length>1&&humans.some(p=>p.id===actor)?actor:humans[0]?.id??0;}
export function localBotActor(s){if(!s||s.phase==='won')return null;const bot=i=>s.players[i]?.controller==='bot'&&!s.players[i].out;if(s.phase==='auction')return s.auction.participants.find(i=>bot(i)&&i!==s.auction.highest&&!s.auction.passed.includes(i))??null;if(s.phase==='buildOffer')return s.buildOffer.pending.find(bot)??null;const claim=s.rentClaims?.find(c=>bot(c.to)&&['roll','end','jail','buy','card'].includes(s.phase));if(claim)return claim.to;const i=decisionActor(s);return bot(i)?i:null;}
export function canControl(s,seat){return !!s?.players[seat]&&s.players[seat].controller==='human'&&!s.players[seat].out;}
export function primaryAction(s,seat,head,blocked=false){
 if(!s)return {label:'Mulai permainan',disabled:true};
 if(blocked)return {label:'Permainan dijeda',details:true,disabled:false};
 if(head)return {label:({diceRolling:'Dadu bergulir…',diceResult:'Hasil dadu',pawnMoving:'Pion bergerak…',tileArrival:'Tiba di petak',financialSettlement:'Transaksi Nusa',eventRevealing:'Lihat kejadian'})[head.kind]||'Memperbarui…',details:true,disabled:!head.event&&!head.finance};
 const claim=claimableRent(s,seat)[0];if(claim)return {label:'Tagih '+money(claim.amount),type:'CLAIM_RENT',data:{claimId:claim.id}};
 const actor=decisionActor(s),mine=actor===seat&&canControl(s,seat);
 if(s.phase==='won')return {label:'Hasil pertandingan',details:true};
 if(s.phase==='auction')return {label:'Lihat lelang',details:true};
 if(!mine)return {label:`Giliran ${s.players[actor]?.name||'pemain'}`,details:true};
 if(s.phase==='starting')return {label:'Lempar awal',type:'START_ROLL'};
 if(s.phase==='roll')return {label:s.extra?'Lempar lagi':'Lempar dadu',type:'ROLL'};
 if(s.phase==='end')return {label:'Akhiri giliran',type:'END'};
 return {label:({buy:'Beli / lelang',card:'Baca kartu',jail:'Pilihan penjara',debt:'Lunasi tagihan',trade:'Tinjau barter',mortgage:'Aset tergadai',buildOffer:'Pilih bangunan'})[s.phase]||'Detail giliran',details:true};
}
export function dicePresentation(s,head){if(head?.kind==='diceRolling')return {stage:'rolling',values:null,label:'Dadu sedang bergulir'};if(head?.kind==='diceResult')return {stage:'result',values:head.dice,label:`${head.dice.join(' + ')} = ${head.dice[0]+head.dice[1]}`};if(s?.presentationDice)return {stage:'idle',values:s.presentationDice.values,label:`${s.presentationDice.values.join(' + ')} = ${s.presentationDice.values[0]+s.presentationDice.values[1]}`,revealId:s.presentationDice.id};const event=s?.log.find(e=>e.audience!=='private'&&e.dice?.length===2);return {stage:'idle',values:event?.dice??null,label:event?`Terakhir ${event.dice.join(' + ')}`:'Siap melempar'};}
export function autoPopup(s,full,head,seat,dismissed){
 if(head?.event)return {kind:'event',key:head.id,event:head.event,interactive:liveCardDecision(head.event,full,seat)};
 if(head?.finance&&head.finance.from===seat&&['tax','rent'].includes(head.finance.kind))return {kind:'settlement',key:head.id,transaction:head.finance};
 if(head)return null;
 const d=gameplayDecision(s);if(!d||d.key===dismissed)return null;
 return canPresentDecision(s,seat)||s.phase==='won'?{kind:s.phase,key:d.key,actor:d.actor}:null;
}
export const claimableRent=(s,seat)=>(['roll','end','jail','buy','card'].includes(s?.phase)?s.rentClaims?.filter(c=>c.to===seat):[])||[];
export const dismissalKey=(p,s)=>p?.kind==='event'&&p.interactive?gameplayDecision(s)?.key||p.key:p?.key||gameplayDecision(s)?.key||'';
export function assetPermission(s,seat,tile,type,busy=false){if(busy)return 'Tunggu presentasi selesai.';if(!canControl(s,seat)||s.assets[tile]?.owner!==seat)return 'Aset pemain lain hanya dapat dilihat.';if(!canManage(s,seat))return 'Selesaikan keputusan aktif dahulu.';if(s.phase==='debt'&&!['SELL','SELL_SET','MORTGAGE'].includes(type))return 'Lunasi utang dahulu.';if(s.phase==='auction'&&type==='BUILD')return 'Selesaikan lelang sebelum memesan bangunan.';if(s.phase==='auction'&&s.auction.highest===seat&&type==='REDEEM'&&s.players[seat].cash-redemption(tile)<s.auction.amount)return 'Kas ini dicadangkan untuk tawaran tertinggi.';return managementError(s,seat,tile,type)||'';}

export const bidMinimum=s=>Math.max(AUCTION_RULES.minimum,(s.auction?.amount||0)+AUCTION_RULES.increment);
export function roomEligibility(room){const humans=room?.seats?.filter(p=>p.controller==='human'&&!p.out)||[];return {humans,needed:room?.vote?Math.floor(room.vote.eligible.length/2)+1:Math.floor(humans.length/2)+1,ready:humans.filter(p=>p.connected&&room.pause?.ready.includes(p.id)).length};}
export {BOARD,money,gameplayDecision,assets,buildTargets,canTrade};

export const requestedPopup=(p,s)=>p.kind==='trade'&&s?.phase==='trade'&&!p.counter?{kind:'tradeIncoming',manual:true}:{...p,manual:true};
