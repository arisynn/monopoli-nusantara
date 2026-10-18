import {secureRandom,randomIndex} from './random.mjs';
import {createBankEconomy,recordBankFinance} from './bank-economy.mjs';
import {moneyData,assetData} from './finance.mjs';
import {validDifficulty} from './bot/mind-config.mjs';
import {recordBotMemory} from './bot/memory.mjs';
import {assignPawns} from './pawns.mjs';
import {nusaText} from './currency.mjs';
import {auctionResultData} from './auction-presentation.mjs';
import {BOARD,GROUPS,DECKS,RULEPACK,PAWNS,money,AUCTION_RULES,auctionMinimum} from './content.mjs';
import * as legacy from './game-v1.mjs';
export {BOARD,GROUPS,DECKS,RULEPACK,PAWNS,money};
const requireRule=(ok,message)=>{if(!ok)throw Error(message)};
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const legacyState=s=>s.schemaVersion===1;
const shuffle=(array,rng)=>{for(let i=array.length-1;i>0;i--){const j=randomIndex(i+1,rng);[array[i],array[j]]=[array[j],array[i]]}return array};
const die=rng=>randomIndex(6,rng)+1;
const roll=rng=>[die(rng),die(rng)];
const sum=d=>d[0]+d[1];
const note=(s,text,type='info',data={})=>{const event={id:++s.eventId,text:nusaText(text),type,turn:s.round,version:s._presentationVersion??s.version,actor:s._actor??s.turn,audience:'public',...data};recordBankFinance(s,event);s.log.unshift(event);s.log=s.log.slice(0,300)};
export const alive=s=>s.players.filter(p=>!p.out);
export const current=s=>s.players[s.turn];
export const assets=(s,id)=>BOARD.filter(t=>s.assets[t.id]?.owner===id);
export const complete=(s,id,group)=>group>=0&&GROUPS[group].ids.every(t=>s.assets[t].owner===id);
const reserved=(s,id)=>s.auction?.highest===id?s.auction.amount:0;
const spendable=(s,id)=>s.players[id].cash-reserved(s,id);
export const interest=tile=>Math.ceil(BOARD[tile].mortgage/10);
export const redemption=tile=>BOARD[tile].mortgage+interest(tile);
export function stock(s){let houses=0,hotels=0;for(const a of Object.values(s.assets)){if(a.level===5)hotels++;else houses+=a.level}return {houses:32-houses,hotels:12-hotels}}
export function worth(s,id){return s.players[id].cash+assets(s,id).reduce((n,t)=>n+(s.assets[t.id].mortgaged?t.mortgage:t.price)+(t.build||0)*s.assets[t.id].level,0)}
export function rent(s,id,dice=7,factor=1,utility=false){const t=BOARD[id],a=s.assets[id];if(!a||a.owner===null||a.mortgaged)return 0;if(t.type==='station')return 250*2**(assets(s,a.owner).filter(t=>t.type==='station').length-1)*factor;if(t.type==='utility')return dice*(utility||assets(s,a.owner).filter(t=>t.type==='utility').length===2?100:40);return t.rents[a.level]*(a.level===0&&complete(s,a.owner,t.group)?2:1)*factor}
export function createGame(config,rng=secureRandom){
 requireRule(config.players?.length>=2&&config.players.length<=6,'Pilih 2–6 pemain.');
 const pawns=assignPawns(config.players);
 const players=config.players.map((p,id)=>({id,name:String(p.name||`Pemain ${id+1}`).slice(0,24),controller:p.controller==='bot'?'bot':'human',...(p.controller==='bot'&&['raka','bima','sari','nusa','apex','kresna'].includes(p.botPersona)?{botPersona:p.botPersona}:{}),...(p.controller==='bot'?{botDifficulty:validDifficulty(p.botDifficulty)?p.botDifficulty:'medium'}:{}),pawn:pawns[id],cash:15000,pos:0,jail:0,inJail:false,cards:[],out:false}));
 const s={schemaVersion:2,presentationVersion:1,rulepackVersion:RULEPACK.id,rules:{preset:config.rules==='classic'?'classic':'digital',rent:config.rules==='classic'?'manual':'auto'},matchId:config.matchId||crypto.randomUUID(),version:0,players,assets:Object.fromEntries(BOARD.filter(t=>t.price).map(t=>[t.id,{owner:null,level:0,mortgaged:false}])),turn:0,startSeat:0,turnSerial:0,round:1,phase:config.startingRoll===false?'roll':'starting',starting:{pending:players.map(p=>p.id),scores:[],history:[],round:1},doubles:0,extra:false,dice:[1,1],utilityDice:null,bank:{houses:32,hotels:12},decks:Object.fromEntries(Object.entries(DECKS).map(([k,v])=>[k,shuffle(v.map((_,i)=>i),rng)])),queue:[],debt:null,auction:null,card:null,trade:null,mortgageDecision:null,buildOffer:null,rentClaims:[],log:[],eventId:0,seen:[],lastMove:null,aiStatus:'Bot lokal',aiComment:/** @type {string|null} */(null),advisorEnabled:config.advisorEnabled===true,difficulty:config.difficulty||'strategis'};
 s.bankEconomy=createBankEconomy(s,{complete:true});
 note(s,'Modal setiap pemain Rp15.000. Aturan dasar mengacu C1009; '+(s.rules.rent==='auto'?'sewa dibukukan otomatis.':'pemilik menagih sewa sebelum pemain berikutnya melempar.'),'start');return s;
}
function win(s){if(alive(s).length===1){s.phase='won';s.winner=alive(s)[0].id;s.queue=[];s.rentClaims=[];return true}return false}
function context(s){return {phase:s.phase,debt:s.debt,card:s.card,trade:s.trade,auction:s.auction,buildOffer:s.buildOffer,mortgageDecision:s.mortgageDecision,buy:s.buy,queue:s.queue}}
function restore(s,c){Object.assign(s,c);if(s.phase==='debt'&&s.players[s.debt.from].out){s.debt=null;resolve(s)}else if(['buy','card','jail','roll'].includes(s.phase)&&current(s).out){s.card=null;s.phase='end';nextTurn(s)}else if(s.phase==='end'&&current(s).out)nextTurn(s)}
function resolve(s){s.phase='resolve';while(s.queue.length&&s.phase==='resolve'){
 const q=s.queue.shift(),p=s.players[q.player??q.from??s.turn];
 if(q.kind==='resume'){restore(s,q.context);continue}
 if(p?.out&& !['auction','mortgage'].includes(q.kind))continue;
 if(q.kind==='pay')transfer(s,q.from,q.to,q.amount,q.label,q);
 if(q.kind==='move'){move(s,p,q.back??((q.to-p.pos+40)%40),!!q.back);landing(s,p,q)}
 if(q.kind==='land')landing(s,p,q);
 if(q.kind==='jail')jail(s,p);
 if(q.kind==='releaseMove'){p.inJail=false;p.jail=0;note(s,`${p.name} bebas setelah membayar denda penjara.`,'release');move(s,p,q.steps);landing(s,p)}
 if(q.kind==='auction')startAuction(s,{kind:'property',tile:q.tile});
 if(q.kind==='mortgage'&&s.assets[q.tile]?.owner===q.player&&s.assets[q.tile].mortgaged&&!s.players[q.player].out){s.mortgageDecision={player:q.player,tile:q.tile};s.phase='mortgage'}
 }if(s.phase==='resolve')s.phase=s.extra?'roll':'end';s.bank=stock(s);if(s.phase==='end'&&current(s).out)nextTurn(s)
}
function transfer(s,from,to,amount,label,meta={}){if(!amount||s.players[from]?.out)return true;const p=s.players[from];if(p.cash<amount){s.debt={from,to,amount,label,...meta};s.phase='debt';note(s,`${p.name} kekurangan ${money(amount-p.cash)} untuk ${label}.`,'debt');return false}p.cash-=amount;if(to!==null&&!s.players[to].out)s.players[to].cash+=amount;note(s,`${p.name} membayar ${money(amount)}${to!==null?' kepada '+s.players[to].name:''} · ${label}.`,'money',moneyData(meta.category||'payment',from,to!==null&&!s.players[to].out?to:null,amount,{...(meta.tile!==undefined?{tile:meta.tile}:{}),...(meta.card?{card:meta.card}:{})}));return true}
function move(s,p,steps,back=false){const from=p.pos,path=[];for(let i=0;i<steps;i++){p.pos=(p.pos+(back?39:1))%40;path.push(p.pos);if(p.pos===0&&!back){p.cash+=2000;note(s,`${p.name} melewati Mulai: +Rp2.000.`,'money',moneyData('salary',null,p.id,2000))}}s.lastMove={id:s.eventId+1,player:p.id,path,from};note(s,`${p.name} tiba di ${BOARD[p.pos].name}.`,'move',{actor:p.id,move:structuredClone(s.lastMove)})}
function jail(s,p,reason='kartu permainan'){const from=p.pos;p.pos=10;p.inJail=true;p.jail=0;s.extra=false;s.doubles=0;const approach=s.lastMove?.id!==s._moveStart&&s.lastMove?.player===p.id&&!s.lastMove?.jump?s.lastMove:null;s.lastMove={id:s.eventId+1,player:p.id,from,path:[10],jump:true,...(approach?{approach}:{})};note(s,`${p.name} masuk penjara: ${reason}.`,'jail',{actor:p.id,move:structuredClone(s.lastMove)})}
function landing(s,p,override={}){const t=BOARD[p.pos],a=s.assets[p.pos];s.utilityDice=null;
 if(a){if(a.owner===null){s.phase='buy';s.buy=t.id;return}if(a.owner!==p.id&&!a.mortgaged){let dice=sum(s.dice);if(t.type==='utility'){s.utilityDice=roll(s._rng);dice=sum(s.utilityDice);note(s,`Dadu baru untuk sewa utilitas: ${s.utilityDice.join(' + ')}.`,'dice',{dice:[...s.utilityDice],diceKind:'utility',actor:p.id})}
 const payment={kind:'pay',from:p.id,to:a.owner,amount:rent(s,t.id,dice,override.rentFactor||1,override.utilityRoll),label:`sewa ${t.name}`,category:'rent',tile:t.id};
 if(s.rules.rent==='manual'){s.rentClaims.push({...payment,id:`${s.matchId}:${s.eventId+1}:rent`,tile:t.id,turnSerial:s.turnSerial});note(s,`${s.players[a.owner].name} dapat menagih ${money(payment.amount)} sebelum pemain berikutnya melempar.`,'rent')}else s.queue.unshift(payment)
 }}else if(t.type==='tax')s.queue.unshift({kind:'pay',from:p.id,to:null,amount:t.tax,label:t.name,category:'tax',tile:t.id});else if(t.type==='gojail')jail(s,p,'petak Masuk Penjara');else if(t.type==='chance'||t.type==='community'){const deck=t.type,idx=s.decks[deck].shift(),card=DECKS[deck][idx];if(!card.jailCard)s.decks[deck].push(idx);s.card={deck,idx,player:p.id,...card,revealId:s.eventId+1};s.phase='card';note(s,`${p.name} mengambil ${deck==='chance'?'Kesempatan':'Dana Umum'}: ${card.title}.`,'card',{actor:p.id,card:structuredClone(s.card)})}
}
function nextTurn(s){s.extra=false;s.doubles=0;s.utilityDice=null;do{s.turn=(s.turn+1)%s.players.length;if(s.turn===s.startSeat)s.round++}while(current(s).out);s.turnSerial++;s.phase=current(s).inJail?'jail':'roll';note(s,`Giliran ${current(s).name}.`,'turn')}
function cardEffect(s){const c=s.card,p=s.players[c.player];s.card=null;
 if(c.jailCard){p.cards.push({deck:c.deck,idx:c.idx});note(s,`${p.name} menyimpan kartu bebas penjara.`)}
 if(c.jail)s.queue.unshift({kind:'jail',player:p.id});if(c.move!==undefined)s.queue.unshift({kind:'move',player:p.id,to:c.move});if(c.back)s.queue.unshift({kind:'move',player:p.id,back:c.back});
 if(c.nearest){let to=p.pos;do{to=(to+1)%40}while(BOARD[to].type!==c.nearest);s.queue.unshift({kind:'move',player:p.id,to,rentFactor:c.rentFactor,utilityRoll:c.utilityRoll})}
 if(c.money>0){p.cash+=c.money;note(s,`${p.name} menerima ${money(c.money)}.`,'money',moneyData('card',null,p.id,c.money,{card:{deck:c.deck,idx:c.idx,title:c.title}}))}if(c.money<0)s.queue.unshift({kind:'pay',from:p.id,to:null,amount:-c.money,label:c.title,category:'card',card:{deck:c.deck,idx:c.idx,title:c.title}});
 if(c.repair){const amount=assets(s,p.id).reduce((n,t)=>n+(s.assets[t.id].level===5?c.repair[1]:s.assets[t.id].level*c.repair[0]),0);s.queue.unshift({kind:'pay',from:p.id,to:null,amount,label:c.title,category:'repair',card:{deck:c.deck,idx:c.idx,title:c.title}})}
 if(c.each)for(const other of alive(s).filter(x=>x.id!==p.id))s.queue.push({kind:'pay',from:c.each<0?p.id:other.id,to:c.each<0?other.id:p.id,amount:Math.abs(c.each),label:c.title,category:'card',card:{deck:c.deck,idx:c.idx,title:c.title}});resolve(s)
}
const managePhases=['roll','end','jail','buy','card','auction','debt'];
export function managementError(s,id,tile,type,options={}){if(legacyState(s))return legacy.managementError(s,id,tile,type);const a=s.assets[tile],t=BOARD[tile];if(!a||a.owner!==id)return 'Ini bukan asetmu.';const group=t.group>=0?GROUPS[t.group].ids:[tile],all=group.map(i=>s.assets[i]);
 if(type==='BUILD'){if(t.type!=='city'||a.level>=5)return 'Tidak dapat membangun lagi.';if(!complete(s,id,t.group))return 'Lengkapi kelompok warna dahulu.';if(all.some(x=>x.mortgaged))return 'Tebus seluruh aset dalam kelompok.';if(a.level>Math.min(...all.map(x=>x.level)))return 'Bangun secara merata.';if(!options.ignoreCash&&s.players[id].cash<t.build)return 'Kas tidak cukup.';if(!options.ignoreStock&&stock(s)[a.level===4?'hotels':'houses']<1)return 'Stok bangunan bank habis.'}
 if(type==='SELL'){if(!a.level)return 'Tidak ada bangunan.';if(a.level<Math.max(...all.map(x=>x.level)))return 'Jual bangunan secara merata.';if(a.level===5&&stock(s).houses<4)return 'Bank membutuhkan 4 rumah untuk menukar hotel. Jual seluruh bangunan set bila perlu.'}
 if(type==='SELL_SET'&&(t.group<0||!all.some(x=>x.level)))return 'Tidak ada bangunan dalam kelompok.';
 if(type==='MORTGAGE'){if(a.mortgaged)return 'Sudah digadai.';if(all.some(x=>x.level))return 'Jual semua bangunan kelompok dahulu.'}
 if(type==='REDEEM'){if(!a.mortgaged)return 'Aset tidak digadai.';if(s.players[id].cash<redemption(tile))return 'Kas tidak cukup.'}
 return null
}
function manage(s,id,tile,type){const error=managementError(s,id,tile,type);requireRule(!error,error);const a=s.assets[tile],t=BOARD[tile],p=s.players[id];
 if(type==='BUILD'){p.cash-=t.build;a.level++;note(s,`${p.name} membangun ${a.level===5?'hotel':`rumah ke-${a.level}`} di ${t.name} · ${money(t.build)}.`,'build',{...moneyData('build',id,null,t.build,{tile}),...assetData(s,[tile])})}
 if(type==='SELL'){p.cash+=t.build/2;a.level--;note(s,`${p.name} menjual bangunan ${t.name}.`,'money',{...moneyData('sell',null,id,t.build/2,{tile}),...assetData(s,[tile])})}
 if(type==='SELL_SET'){const before=p.cash;for(const i of GROUPS[t.group].ids){p.cash+=BOARD[i].build*s.assets[i].level/2;s.assets[i].level=0}note(s,`${p.name} menjual semua bangunan kelompok ${GROUPS[t.group].name}.`,'money',{...moneyData('sell',null,id,p.cash-before,{tile}),...assetData(s,GROUPS[t.group].ids)})}
 if(type==='MORTGAGE'){p.cash+=t.mortgage;a.mortgaged=true;note(s,`${p.name} menggadaikan ${t.name}: +${money(t.mortgage)}.`,'money',{...moneyData('mortgage',null,id,t.mortgage,{tile}),...assetData(s,[tile])})}
 if(type==='REDEEM'){p.cash-=redemption(tile);a.mortgaged=false;note(s,`${p.name} menebus ${t.name} · ${money(redemption(tile))}.`,'money',{...moneyData('redeem',id,null,redemption(tile),{tile}),...assetData(s,[tile])})}
}
export function buildTargets(s,id,kind){return assets(s,id).filter(t=>(s.assets[t.id].level===4?'hotel':'house')===kind&&!managementError(s,id,t.id,'BUILD',{ignoreCash:true})).map(t=>t.id)}
function requestBuilding(s,id,tile){const error=managementError(s,id,tile,'BUILD');requireRule(!error,error);const kind=s.assets[tile].level===4?'hotel':'house',remaining=stock(s)[kind==='house'?'houses':'hotels'];
 const eligible=alive(s).filter(p=>p.cash>=100&&buildTargets(s,p.id,kind).length).map(p=>p.id);
 if(remaining>eligible.length||eligible.length<2){manage(s,id,tile,'BUILD');return}
 const before=context(s);s.queue=[{kind:'resume',context:before}];s.phase='buildOffer';s.buildOffer={kind,remaining,eligible,pending:eligible.filter(x=>x!==id),targets:{[id]:tile}};note(s,`Stok ${kind==='house'?'rumah':'hotel'} tersisa ${remaining}. Pemain lain dapat menyatakan minat sebelum pembelian.`,'auction');finishBuildOffer(s)
}
function finishBuildOffer(s){const b=s.buildOffer;if(b.pending.length)return;const players=Object.keys(b.targets).map(Number);s.buildOffer=null;
 if(players.length>b.remaining){startAuction(s,{kind:'building',building:b.kind,targets:b.targets,participants:players});return}
 for(const id of players){const tile=b.targets[id];if(!managementError(s,id,tile,'BUILD'))manage(s,id,tile,'BUILD');else note(s,`${s.players[id].name} belum mampu membayar harga bangunan; pesanan dibatalkan.`)}resolve(s)
}
function startAuction(s,options){const participants=options.participants||alive(s).map(p=>p.id);s.phase='auction';s.auction={id:`${s.matchId}:auction:${s.eventId+1}`,...options,participants,highest:null,amount:0,passed:[],bidder:participants.includes(s.turn)?s.turn:participants[0]};note(s,`Lelang ${options.kind==='building'?(options.building==='house'?'rumah':'hotel'):BOARD[options.tile].name}: mulai ${money(AUCTION_RULES.minimum)}, kenaikan minimal ${money(AUCTION_RULES.increment)}.`,'auction')}
function recordAuctionResult(s,a){const result=auctionResultData(s,a),name=result.kind==='building'?`${a.building==='house'?'rumah':'hotel'}${result.tile===null?'':' di '+BOARD[result.tile].name}`:BOARD[result.tile].name;note(s,result.winner===null?`Lelang ${name} selesai tanpa pemenang.`:`Lelang selesai: ${s.players[result.winner].name} memenangkan ${name} · ${money(result.amount)}.`,'auctionResult',{auctionResult:result})}
function advanceAuction(s){const a=s.auction,candidates=a.participants.filter(i=>i!==a.highest&&!a.passed.includes(i));if(candidates.length){a.bidder=candidates.find(i=>i>a.bidder)??candidates[0];return}
 if(a.highest!==null){const winner=s.players[a.highest];requireRule(winner.cash>=a.amount,'Kas pemenang tidak cukup.');winner.cash-=a.amount;
 if(a.kind==='building'){const tile=a.targets[a.highest];requireRule(!managementError(s,a.highest,tile,'BUILD',{ignoreCash:true}),'Lokasi bangunan tidak valid.');s.assets[tile].level++;note(s,`${winner.name} memenangkan ${a.building==='house'?'rumah':'hotel'} untuk ${BOARD[tile].name} seharga ${money(a.amount)}.`,'build',{...moneyData('auction',winner.id,null,a.amount,{tile}),...assetData(s,[tile])});const targets={...a.targets};delete targets[a.highest];const remaining=stock(s)[a.building==='house'?'houses':'hotels'];recordAuctionResult(s,a);s.auction=null;if(remaining>0&&Object.keys(targets).length){startAuction(s,{kind:'building',building:a.building,targets,participants:Object.keys(targets).map(Number)});return}}
 else{s.assets[a.tile].owner=a.highest;note(s,`${winner.name} memenangkan ${BOARD[a.tile].name} seharga ${money(a.amount)}.`,'buy',{...moneyData('auction',winner.id,null,a.amount,{tile:a.tile}),...assetData(s,[a.tile])})}
 }else note(s,'Tidak ada penawaran. Aset tetap di bank.','auction');if(a.kind!=='building'||a.highest===null)recordAuctionResult(s,a);s.auction=null;resolve(s)
}
function tradeCheck(s,t){requireRule(t.from!==t.to&&s.players[t.to]&&!s.players[t.to].out,'Pilih pemain lain.');for(const n of [t.giveCash,t.takeCash,t.giveCards,t.takeCards])requireRule(integer(n),'Nilai penawaran tidak valid.');requireRule(Array.isArray(t.give)&&Array.isArray(t.take),'Pilih aset.');requireRule(new Set([...t.give,...t.take]).size===t.give.length+t.take.length,'Aset duplikat.');for(const [ids,id] of [[t.give,t.from],[t.take,t.to]])for(const tile of ids){const a=s.assets[tile],b=BOARD[tile];requireRule(a&&a.owner===id,'Kepemilikan aset berubah.');requireRule(b.group<0||GROUPS[b.group].ids.every(i=>s.assets[i].level===0),'Jual bangunan dalam kelompok sebelum barter.')}
 requireRule(s.players[t.from].cash>=t.giveCash&&s.players[t.to].cash>=t.takeCash,'Kas penawaran tidak cukup.');const feeFrom=t.take.reduce((n,i)=>n+(s.assets[i].mortgaged?interest(i):0),0),feeTo=t.give.reduce((n,i)=>n+(s.assets[i].mortgaged?interest(i):0),0);if(s.auction){requireRule(s.players[t.from].cash-t.giveCash+t.takeCash>=reserved(s,t.from)+feeFrom&&s.players[t.to].cash+t.giveCash-t.takeCash>=reserved(s,t.to)+feeTo,'Kas penawaran tertinggi dan bunga penerimaan harus tetap tersedia.');if(s.auction.kind==='building'&&s.auction.highest!==null){const high=s.auction.highest,group=BOARD[s.auction.targets[high]].group,ids=high===t.from?t.give:high===t.to?t.take:[];requireRule(!ids.some(i=>BOARD[i].group===group),'Kelompok untuk bangunan yang sedang ditawar tidak boleh ditransfer.')}}requireRule(s.players[t.from].cards.length>=t.giveCards&&s.players[t.to].cards.length>=t.takeCards,'Kartu tidak tersedia.')
}
function bankrupt(s,id){const d=s.debt,p=s.players[id];requireRule(d&&d.from===id,'Bukan utangmu.');const liquidation=p.cash+assets(s,id).reduce((n,t)=>n+(s.assets[t.id].mortgaged?0:t.mortgage)+(t.build||0)*s.assets[t.id].level/2,0);requireRule(liquidation<d.amount,'Aset masih cukup; jual bangunan atau gadaikan dahulu.');const startingCash=p.cash,estateTiles=assets(s,id).map(t=>t.id);const receiver=d.to!==null&&!s.players[d.to].out?s.players[d.to]:null,after=[];
 for(const t of assets(s,id)){const a=s.assets[t.id];p.cash+=(t.build||0)*a.level/2;a.level=0;a.owner=receiver?receiver.id:null;if(receiver&&a.mortgaged)after.push({kind:'mortgage',player:receiver.id,tile:t.id});if(!receiver){a.mortgaged=false;after.push({kind:'auction',tile:t.id})}}
 const estateCash=p.cash;if(receiver){receiver.cash+=p.cash;receiver.cards.push(...p.cards)}else for(const c of p.cards)s.decks[c.deck].push(c.idx);p.cards=[];p.cash=0;p.out=true;s.debt=null;s.rentClaims=s.rentClaims.filter(c=>c.from!==id&&c.to!==id);note(s,`${p.name} bangkrut${receiver?' kepada '+receiver.name:' kepada bank'}.`,'bankrupt',{actor:id,finance:[...moneyData('liquidation',null,id,estateCash-startingCash).finance,...moneyData('bankruptcy',id,receiver?.id??null,estateCash).finance],...assetData(s,estateTiles)});s.queue=s.queue.filter(q=>q.from!==id&&q.player!==id);s.queue.unshift(...after);if(win(s))return;if(id===s.turn){s.extra=false;s.doubles=0}resolve(s)
}
export function canManage(s,id){return !!s.players[id]&&!s.players[id].out&&managePhases.includes(s.phase)&&(s.phase!=='debt'||s.debt.from===id)}
export function canTrade(s,id){return !!s.players[id]&&!s.players[id].out&&['roll','end','jail','buy','card','debt','auction'].includes(s.phase)}
export function command(input,actor,a,rng=secureRandom){
 if(legacyState(input))return legacy.command(input,actor,a,rng);
 requireRule(input?.schemaVersion===2,'Save tidak kompatibel.');if(a.id&&input.seen.includes(a.id))return input;requireRule(a.expectedVersion===undefined||a.expectedVersion===input.version,'State berubah. Coba lagi.');requireRule(input.phase!=='won','Pertandingan selesai.');requireRule(input.players[actor]&&!input.players[actor].out,'Pemain tidak aktif.');
 const s=structuredClone(input);s.bankEconomy||=createBankEconomy(input);s._rng=rng;s._moveStart=s.lastMove?.id;s._presentationVersion=input.version+1;s._actor=actor;const p=s.players[actor],active=s.turn===actor;
 if(['BUILD','SELL','SELL_SET','MORTGAGE','REDEEM'].includes(a.type)){
 requireRule(canManage(s,actor),'Selesaikan keputusan aktif dahulu.');requireRule(s.phase!=='debt'||['SELL','SELL_SET','MORTGAGE'].includes(a.type),'Lunasi utang dahulu.');
 if(s.phase==='auction'&&s.auction.highest===actor&&['BUILD','REDEEM'].includes(a.type)){const cost=a.type==='BUILD'?BOARD[a.tile]?.build:redemption(a.tile);requireRule(p.cash-cost>=s.auction.amount,'Kas ini dicadangkan untuk tawaran tertinggi.')}
 if(a.type==='BUILD'){requireRule(s.phase!=='auction','Selesaikan lelang sebelum memesan bangunan.');requestBuilding(s,actor,a.tile)}else manage(s,actor,a.tile,a.type);if(s.auction?.kind==='building'&&s.auction.highest===actor){const target=s.auction.targets[actor];requireRule(buildTargets(s,actor,s.auction.building).includes(target),'Kelompok untuk bangunan yang sedang ditawar harus tetap memenuhi syarat.')}
 }else if(a.type==='START_ROLL'){
 requireRule(s.phase==='starting'&&s.starting.pending[0]===actor,'Tunggu giliran lempar awal.');const dice=roll(rng);s.dice=dice;s.starting.scores.push({player:actor,dice,total:sum(dice)});s.starting.pending.shift();note(s,`${p.name}: lempar awal ${dice.join(' + ')} = ${sum(dice)}.`,'dice',{dice:[...dice],diceKind:'opening',actor});
 if(!s.starting.pending.length){const best=Math.max(...s.starting.scores.map(x=>x.total)),leaders=s.starting.scores.filter(x=>x.total===best).map(x=>x.player);s.starting.history.push(...s.starting.scores);if(leaders.length===1){s.turn=s.startSeat=leaders[0];s.phase='roll';note(s,`${current(s).name} mulai, lalu giliran mengikuti urutan kursi.`,'turn')}else{s.starting.pending=leaders;s.starting.scores=[];s.starting.round++;note(s,'Nilai tertinggi seri; peserta seri melempar ulang.','dice')}}
 }else if(a.type==='ROLL'){
 requireRule(active&&['roll','jail'].includes(s.phase),'Belum waktunya melempar.');const expired=s.rentClaims.filter(c=>c.turnSerial<s.turnSerial);for(const c of expired)note(s,`Klaim sewa ${BOARD[c.tile].name} kedaluwarsa.`,'rent');s.rentClaims=s.rentClaims.filter(c=>c.turnSerial>=s.turnSerial);
 const dice=roll(rng),double=dice[0]===dice[1];s.dice=dice;s.extra=false;note(s,`${p.name} melempar ${dice.join(' + ')}${double?' · kembar':''}.`,'dice',{dice:[...dice],diceKind:'movement',actor});
 if(p.inJail){p.jail++;if(double){p.inJail=false;p.jail=0;note(s,`${p.name} bebas dengan dadu kembar.`,'release');move(s,p,sum(dice));s.queue.push({kind:'land',player:actor});resolve(s)}else if(p.jail>=3){s.queue.push({kind:'pay',from:actor,to:null,amount:500,label:'denda penjara',category:'jail'},{kind:'releaseMove',player:actor,steps:sum(dice)});resolve(s)}else s.phase='end'}else{s.doubles=double?s.doubles+1:0;if(s.doubles===3){jail(s,p,'tiga kali dadu kembar berturut-turut');s.phase='end'}else{s.extra=double;move(s,p,sum(dice));s.queue.push({kind:'land',player:actor});resolve(s)}}
 }else if(a.type==='JAIL_PAY'||a.type==='JAIL_CARD'){
 requireRule(active&&s.phase==='jail','Bukan keputusan penjara.');if(a.type==='JAIL_PAY'){requireRule(p.cash>=500,'Kas tidak cukup.');p.cash-=500;note(s,`${p.name} membayar Rp500 untuk bebas.`,'money',moneyData('jail',actor,null,500))}else{requireRule(p.cards.length,'Tidak ada kartu bebas.');const c=p.cards.splice(a.cardIndex??0,1)[0];requireRule(c,'Kartu tidak tersedia.');s.decks[c.deck].push(c.idx)}p.inJail=false;p.jail=0;note(s,`${p.name} bebas dari penjara.`,'release');s.phase='roll';
 }else if(a.type==='BUY'){requireRule(active&&s.phase==='buy'&&s.assets[s.buy].owner===null,'Tidak ada properti ditawarkan.');const t=BOARD[s.buy];requireRule(p.cash>=t.price,'Kas tidak cukup. Gadai atau lakukan barter, atau mulai lelang.');p.cash-=t.price;s.assets[t.id].owner=actor;note(s,`${p.name} membeli ${t.name} · ${money(t.price)}.`,'buy',{...moneyData('purchase',actor,null,t.price,{tile:t.id}),...assetData(s,[t.id])});resolve(s)
 }else if(a.type==='AUCTION'){requireRule(active&&s.phase==='buy','Tidak ada properti ditawarkan.');startAuction(s,{kind:'property',tile:s.buy})
 }else if(a.type==='BID'||a.type==='PASS'){
 requireRule(s.phase==='auction'&&s.auction.participants.includes(actor),'Kamu bukan peserta lelang.');const auction=s.auction;
 if(a.type==='BID'){if(auction.kind==='building')requireRule(buildTargets(s,actor,auction.building).includes(auction.targets[actor]),'Lokasi bangunan tidak lagi memenuhi syarat.');requireRule(integer(a.amount)&&a.amount%AUCTION_RULES.increment===0&&a.amount>=auctionMinimum(auction),`Tawaran awal minimal ${money(AUCTION_RULES.minimum)}; naik minimal ${money(AUCTION_RULES.increment)}, kelipatan ${money(AUCTION_RULES.increment)}.`);requireRule(p.cash>=a.amount,'Kas tidak cukup.');auction.highest=actor;auction.amount=a.amount;auction.passed=[];note(s,`${p.name} menawar ${money(a.amount)}.`,'auction')}
 else{requireRule(auction.highest!==actor,'Penawar tertinggi sudah berkomitmen.');if(!auction.passed.includes(actor))auction.passed.push(actor);note(s,`${p.name} tidak menaikkan tawaran saat ini.`,'auction')}advanceAuction(s)
 }else if(a.type==='BUILD_JOIN'||a.type==='BUILD_DECLINE'){
 requireRule(s.phase==='buildOffer'&&s.buildOffer.pending.includes(actor),'Bukan keputusan pemesananmu.');if(a.type==='BUILD_JOIN'){requireRule(buildTargets(s,actor,s.buildOffer.kind).includes(a.tile),'Pilih lokasi pembangunan yang sah.');s.buildOffer.targets[actor]=a.tile}s.buildOffer.pending=s.buildOffer.pending.filter(i=>i!==actor);finishBuildOffer(s)
 }else if(a.type==='ACK'){requireRule(s.phase==='card'&&s.card.player===actor,'Bukan kartumu.');cardEffect(s)
 }else if(a.type==='CLAIM_RENT'){
 requireRule(['roll','end','jail','buy','card'].includes(s.phase),'Selesaikan transaksi aktif sebelum menagih.');const claim=s.rentClaims.find(c=>c.id===a.claimId);requireRule(claim&&claim.to===actor,'Klaim tidak tersedia.');s.rentClaims=s.rentClaims.filter(c=>c.id!==claim.id);const before=context(s);s.queue=[{...claim,kind:'pay'},{kind:'resume',context:before}];resolve(s)
 }else if(a.type==='MORTGAGE_KEEP'||a.type==='MORTGAGE_REDEEM'){
 requireRule(s.phase==='mortgage'&&s.mortgageDecision.player===actor,'Bukan keputusan aset tergadaimu.');const tile=s.mortgageDecision.tile;s.mortgageDecision=null;
 if(a.type==='MORTGAGE_REDEEM'){requireRule(spendable(s,actor)>=redemption(tile),'Kas setelah cadangan lelang belum cukup untuk langsung menebus.');p.cash-=redemption(tile);s.assets[tile].mortgaged=false;note(s,`${p.name} langsung menebus ${BOARD[tile].name}: ${money(redemption(tile))}.`,'money',{...moneyData('redeem',actor,null,redemption(tile),{tile}),...assetData(s,[tile])});resolve(s)}else{s.queue.unshift({kind:'pay',from:actor,to:null,amount:interest(tile),label:`bunga penerimaan ${BOARD[tile].name}`,category:'interest',tile});resolve(s)}
 }else if(a.type==='PAY'){requireRule(s.phase==='debt'&&s.debt.from===actor,'Bukan utangmu.');const d=s.debt;requireRule(p.cash>=d.amount,'Dana belum cukup. Jual, gadai, atau barter.');s.debt=null;transfer(s,d.from,d.to,d.amount,d.label,d);resolve(s)
 }else if(a.type==='BANKRUPT'){bankrupt(s,actor)
 }else if(a.type==='END'){requireRule(active&&s.phase==='end','Selesaikan keputusan dahulu.');nextTurn(s)
 }else if(a.type==='OFFER'){
 requireRule(canTrade(s,actor),'Selesaikan transaksi aktif sebelum barter.');const t={...a.trade,from:actor,returnPhase:s.phase,context:context(s)};tradeCheck(s,t);p.lastOfferRound=s.round;s.trade=t;s.phase='trade';note(s,`${p.name} menawarkan barter kepada ${s.players[t.to].name}.`,'trade')
 }else if(a.type==='COUNTER'){
 requireRule(s.phase==='trade'&&s.trade.to===actor,'Bukan penerima penawaran.');const t={...a.trade,from:actor,to:s.trade.from,returnPhase:s.trade.returnPhase,context:s.trade.context};tradeCheck(s,t);s.trade=t;note(s,`${p.name} mengajukan tawaran balik.`,'trade')
 }else if(a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT'){
 requireRule(s.phase==='trade'&&(s.trade.to===actor||(a.type==='TRADE_REJECT'&&s.trade.from===actor)),'Bukan keputusan bartermu.');const t=s.trade;
 if(a.type==='TRADE_REJECT'){note(s,`Tawaran ${s.players[t.from].name} kepada ${s.players[t.to].name} ${actor===t.from?'dibatalkan pengirim':'ditolak'}.`,'trade');restore(s,t.context)}else{tradeCheck(s,t);s.players[t.from].cash+=t.takeCash-t.giveCash;s.players[t.to].cash+=t.giveCash-t.takeCash;const transfers=[];for(const [ids,owner] of [[t.give,t.to],[t.take,t.from]])for(const tile of ids){s.assets[tile].owner=owner;if(s.assets[tile].mortgaged)transfers.push({kind:'mortgage',tile,player:owner})}const given=s.players[t.from].cards.splice(0,t.giveCards),taken=s.players[t.to].cards.splice(0,t.takeCards);s.players[t.from].cards.push(...taken);s.players[t.to].cards.push(...given);s.trade=null;const summary=(id,ids,cash,cards)=>`${s.players[id].name} memberikan ${[...ids.map(i=>BOARD[i].name+(s.assets[i].mortgaged?' (digadai)':'')),...(cash?[money(cash)]:[]),...(cards?[`${cards} kartu bebas penjara`]:[])].join(', ')||'tanpa aset'}`;note(s,`Barter selesai: ${summary(t.from,t.give,t.giveCash,t.giveCards)}; ${summary(t.to,t.take,t.takeCash,t.takeCards)}.${transfers.length?' Penerima aset tergadai memilih tebus atau bayar bunga.':''}`,'trade',{finance:[...moneyData('trade',t.from,t.to,t.giveCash).finance,...moneyData('trade',t.to,t.from,t.takeCash).finance],...assetData(s,[...t.give,...t.take])});s.queue=[...transfers,{kind:'resume',context:t.context}];resolve(s)}
 }else throw Error('Aksi tidak dikenal.');
 recordBotMemory(s,input,actor,a);delete s._rng;delete s._moveStart;delete s._presentationVersion;delete s._actor;s.version++;if(a.id)s.seen=[...s.seen.slice(-199),a.id];s.bank=stock(s);return s
}
export function decisionActor(s){if(legacyState(s))return legacy.decisionActor(s);if(s.phase==='starting')return s.starting.pending[0];if(s.phase==='buildOffer')return s.buildOffer.pending[0];if(s.phase==='mortgage')return s.mortgageDecision.player;if(s.phase==='auction')return s.auction.bidder;if(s.phase==='debt')return s.debt.from;if(s.phase==='card')return s.card.player;if(s.phase==='trade')return s.trade.to;const botClaim=s.rentClaims.find(c=>s.players[c.to].controller==='bot'&&['roll','end','jail','buy'].includes(s.phase));return botClaim?.to??s.turn}
export function botCandidates(s,id){if(legacyState(s))return legacy.botCandidates(s,id);const p=s.players[id],actions=[];const add=(type,data={})=>actions.push({type,...data});
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
 if(s.phase==='trade'&&s.trade.to===id){try{tradeCheck(s,s.trade);add('TRADE_ACCEPT')}catch{}add('TRADE_REJECT')}
 return actions.map((a,i)=>({...a,actionId:`a${i}`}))
}
export function chooseBot(s,id){if(legacyState(s))return legacy.chooseBot(s,id);const actions=botCandidates(s,id),p=s.players[id],get=type=>actions.find(a=>a.type===type);if(get('CLAIM_RENT'))return get('CLAIM_RENT');
 if(s.phase==='buy')return (p.cash-BOARD[s.buy].price>(s.difficulty==='pemula'?2400:1200)?get('BUY'):null)||get('AUCTION');
 if(s.phase==='auction'){const a=s.auction,t=a.kind==='building'?BOARD[a.targets[id]]:BOARD[a.tile],limit=a.kind==='building'?t.build*1.8:t.price*(assets(s,id).some(x=>x.group===t.group&&x.group>=0)?1.3:.9);return auctionMinimum(a)<=Math.min(limit,p.cash-1000)?get('BID')||get('PASS'):get('PASS')}
 if(s.phase==='buildOffer')return p.cash>2500?get('BUILD_JOIN')||get('BUILD_DECLINE'):get('BUILD_DECLINE');
 if(s.phase==='mortgage')return p.cash-redemption(s.mortgageDecision.tile)>1800?get('MORTGAGE_REDEEM')||get('MORTGAGE_KEEP'):get('MORTGAGE_KEEP');
 if(s.phase==='jail')return get('JAIL_CARD')||(assets(s,id).length<7&&p.cash>1800?get('JAIL_PAY'):null)||get('ROLL');
 if(s.phase==='trade'){const t=s.trade,value=ids=>ids.reduce((n,i)=>n+(s.assets[i].mortgaged?BOARD[i].mortgage:BOARD[i].price),0);return value(t.give)+t.giveCash+500*t.giveCards>=value(t.take)+t.takeCash+500*t.takeCards?get('TRADE_ACCEPT')||get('TRADE_REJECT'):get('TRADE_REJECT')}
 return get('PAY')||get('SELL')||get('SELL_SET')||get('MORTGAGE')||get('BUILD')||get('REDEEM')||get('OFFER')||actions[0]
}
export function publicState(s){if(legacyState(s))return legacy.publicState(s);const {decks,seen,botMemory,...result}=structuredClone(s);result.log=result.log.filter(e=>e.audience!=='private');return result}
