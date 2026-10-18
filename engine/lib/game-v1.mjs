import {secureRandom,randomIndex} from './random.mjs';
import {auctionResultData} from './auction-presentation.mjs';
import {BOARD,GROUPS,DECKS,RULEPACK,PAWNS,money} from './content-v1.mjs';
export {BOARD,GROUPS,DECKS,RULEPACK,PAWNS,money};
const fail=m=>{throw Error(m)};
const requireRule=(condition,msg)=>{if(!condition)fail(msg)};
const integer=(v)=>Number.isSafeInteger(v)&&v>=0;
const shuffle=(a,rng)=>{for(let i=a.length-1;i>0;i--){let j=randomIndex(i+1,rng);[a[i],a[j]]=[a[j],a[i]]}return a};
const note=(s,text,type='info')=>{s.log.unshift({id:++s.eventId,text,type,turn:s.round});s.log=s.log.slice(0,100)};
export const alive=s=>s.players.filter(p=>!p.out);
export const current=s=>s.players[s.turn];
export const assets=(s,p)=>BOARD.filter(t=>s.assets[t.id]?.owner===p);
export const complete=(s,p,g)=>g>=0&&GROUPS[g].ids.every(i=>s.assets[i].owner===p);
export function stock(s){let houses=0,hotels=0;Object.values(s.assets).forEach(a=>{if(a.level===5)hotels++;else houses+=a.level});return {houses:32-houses,hotels:12-hotels}}
export function worth(s,p){return s.players[p].cash+assets(s,p).reduce((n,t)=>n+(s.assets[t.id].mortgaged?t.mortgage:t.price)+(t.build||0)*s.assets[t.id].level,0)}
export function rent(s,id,dice=7,factor=1,utility=false){const t=BOARD[id],a=s.assets[id];if(!a||a.owner===null||a.mortgaged)return 0;
 if(t.type==='station')return 250*2**(assets(s,a.owner).filter(t=>t.type==='station').length-1)*factor;
 if(t.type==='utility')return dice*(utility?100:assets(s,a.owner).filter(t=>t.type==='utility').length===2?100:40);
 return t.rents[a.level]*(a.level===0&&complete(s,a.owner,t.group)?2:1)*factor;
}
export function createGame(config,rng=secureRandom){requireRule(config.players?.length>=2&&config.players.length<=4,'Pilih 2–4 pemain.');
 const players=config.players.map((p,i)=>({id:i,name:String(p.name||`Pemain ${i+1}`).slice(0,24),controller:p.controller==='bot'?'bot':'human',pawn:i,cash:15000,pos:0,jail:0,inJail:false,cards:[],out:false}));
 const s={schemaVersion:1,rulepackVersion:RULEPACK.id,matchId:config.matchId||globalThis.crypto.randomUUID(),version:0,players,assets:Object.fromEntries(BOARD.filter(t=>t.price).map(t=>[t.id,{owner:null,level:0,mortgaged:false}])),turn:0,round:1,phase:'roll',doubles:0,extra:false,dice:[1,1],bank:stock({assets:{}}),decks:Object.fromEntries(Object.entries(DECKS).map(([k,d])=>[k,shuffle(d.map((_,i)=>i),rng)])),queue:[],debt:null,auction:null,card:null,trade:null,log:[],eventId:0,seen:[],lastMove:null,aiStatus:'Bot lokal',difficulty:config.difficulty||'strategis'};
 note(s,'Petualangan dimulai. Setiap pemain menerima Rp15.000.','start');return s;
}
function jail(s,p){p.pos=10;p.inJail=true;p.jail=0;s.extra=false;s.doubles=0;s.lastMove={id:s.eventId+1,player:p.id,path:[10],jump:true};note(s,`${p.name} masuk penjara.`,'jail')}
function move(s,p,steps,back=false){const from=p.pos;let path=[];for(let i=0;i<steps;i++){p.pos=(p.pos+(back?39:1))%40;path.push(p.pos);if(p.pos===0&&!back){p.cash+=2000;note(s,`${p.name} melewati Mulai: +Rp2.000.`,'money')}}s.lastMove={id:s.eventId+1,player:p.id,path,from};note(s,`${p.name} tiba di ${BOARD[p.pos].name}.`,'move')}
function transfer(s,from,to,amount,label){if(!amount||s.players[from]?.out)return true;const p=s.players[from];if(p.cash<amount){s.debt={from,to,amount,label};s.phase='debt';note(s,`${p.name} membutuhkan ${money(amount-p.cash)} untuk ${label}.`,'debt');return false}p.cash-=amount;if(to!==null&&!s.players[to].out)s.players[to].cash+=amount;note(s,`${p.name} membayar ${money(amount)}${to!==null?' kepada '+s.players[to].name:''} · ${label}.`,'money');return true}
function landing(s,p,override={}){const t=BOARD[p.pos],a=s.assets[p.pos];
 if(a){if(a.owner===null){s.phase='buy';s.buy=t.id;return}if(a.owner!==p.id&&!a.mortgaged){let dice=s.dice[0]+s.dice[1];if(override.utilityRoll){s.dice=[rollDie(s._rng),rollDie(s._rng)];dice=s.dice[0]+s.dice[1];note(s,`Dadu utilitas: ${s.dice.join(' + ')}.`)}s.queue.unshift({kind:'pay',from:p.id,to:a.owner,amount:rent(s,t.id,dice,override.rentFactor||1,override.utilityRoll),label:`sewa ${t.name}`})}}
 else if(t.type==='tax')s.queue.unshift({kind:'pay',from:p.id,to:null,amount:t.tax,label:t.name});
 else if(t.type==='gojail')jail(s,p);
 else if(t.type==='chance'||t.type==='community'){const deck=t.type;const idx=s.decks[deck].shift();const card=DECKS[deck][idx];if(!card.jailCard)s.decks[deck].push(idx);s.card={deck,idx,player:p.id,...card};s.phase='card';note(s,`${p.name} mengambil ${deck==='chance'?'Kesempatan':'Dana Umum'}: ${card.title}.`,'card')}
}
function resolve(s){s.phase='resolve';while(s.queue.length&&s.phase==='resolve'){const q=s.queue.shift();const p=s.players[q.player??q.from??s.turn];if(p?.out&&q.kind!=='auction')continue;
 if(q.kind==='pay')transfer(s,q.from,q.to,q.amount,q.label);
 if(q.kind==='move'){let steps=q.back??((q.to-p.pos+40)%40);move(s,p,steps,!!q.back);landing(s,p,q)}
 if(q.kind==='land')landing(s,p,q);
 if(q.kind==='jail')jail(s,p);
 if(q.kind==='releaseMove'){p.inJail=false;p.jail=0;move(s,p,q.steps);landing(s,p)}
 if(q.kind==='auction'){startAuction(s,q.tile);}
 }
 if(s.phase==='resolve')s.phase=s.extra?'roll':'end';s.bank=stock(s);
}
const rollDie=rng=>1+randomIndex(6,rng);
function startAuction(s,tile){s.phase='auction';const participants=alive(s).map(p=>p.id);s.auction={id:`${s.matchId}:auction:${s.eventId+1}`,tile,participants,highest:null,amount:0,bidder:participants.includes(s.turn)?s.turn:participants[0]};note(s,`Lelang ${BOARD[tile].name} dibuka dari Rp100.`,'auction')}
function advanceAuction(s){let a=s.auction;const challengers=a.participants.filter(i=>i!==a.highest);if(!challengers.length){if(a.highest!==null){s.players[a.highest].cash-=a.amount;s.assets[a.tile].owner=a.highest;note(s,`${s.players[a.highest].name} memenangkan ${BOARD[a.tile].name} seharga ${money(a.amount)}.`,'buy')}else note(s,`${BOARD[a.tile].name} tetap milik bank.`);const result=auctionResultData(s,a);note(s,result.winner===null?`Lelang ${BOARD[a.tile].name} selesai tanpa pemenang.`:`Lelang selesai: ${s.players[result.winner].name} memenangkan ${BOARD[a.tile].name} · ${money(result.amount)}.`,'auctionResult');s.log[0].auctionResult=result;s.auction=null;resolve(s);return}
 for(let k=1;k<=s.players.length;k++){let next=(a.bidder+k)%s.players.length;if(challengers.includes(next)){a.bidder=next;break}}
}
function cardEffect(s){let c=s.card,p=s.players[c.player];s.card=null;
 if(c.jailCard){p.cards.push({deck:c.deck,idx:c.idx});note(s,`${p.name} menyimpan kartu bebas penjara.`)}
 if(c.jail)s.queue.unshift({kind:'jail',player:p.id});
 if(c.move!==undefined)s.queue.unshift({kind:'move',player:p.id,to:c.move});
 if(c.back)s.queue.unshift({kind:'move',player:p.id,back:c.back});
 if(c.nearest){let to=p.pos;do {to=(to+1)%40}while(BOARD[to].type!==c.nearest);s.queue.unshift({kind:'move',player:p.id,to,rentFactor:c.rentFactor,utilityRoll:c.utilityRoll})}
 if(c.money>0){p.cash+=c.money;note(s,`${p.name} menerima ${money(c.money)}.`,'money')}
 if(c.money<0)s.queue.unshift({kind:'pay',from:p.id,to:null,amount:-c.money,label:c.title});
 if(c.repair){let amount=assets(s,p.id).reduce((n,t)=>n+(s.assets[t.id].level===5?c.repair[1]:s.assets[t.id].level*c.repair[0]),0);s.queue.unshift({kind:'pay',from:p.id,to:null,amount,label:c.title})}
 if(c.each)for(const other of alive(s).filter(x=>x.id!==p.id))s.queue.push({kind:'pay',from:c.each<0?p.id:other.id,to:c.each<0?other.id:p.id,amount:Math.abs(c.each),label:c.title});resolve(s);
}
export function managementError(s,p,id,action){const t=BOARD[id],a=s.assets[id];if(!a||a.owner!==p)return 'Ini bukan asetmu.';const group=t.group>=0?GROUPS[t.group].ids:[id];const all=group.map(i=>s.assets[i]);
 if(action==='BUILD'){if(t.type!=='city'||a.level>=5)return 'Tidak dapat membangun lagi.';if(!complete(s,p,t.group))return 'Lengkapi kelompok warna terlebih dahulu.';if(all.some(x=>x.mortgaged))return 'Tebus seluruh aset dalam kelompok ini.';if(a.level>Math.min(...all.map(x=>x.level)))return 'Bangun merata di setiap kota dalam kelompok.';if(s.players[p].cash<t.build)return 'Kas tidak cukup.';if(a.level<4&&stock(s).houses<1)return 'Stok rumah bank habis.';if(a.level===4&&stock(s).hotels<1)return 'Stok hotel bank habis.'}
 if(action==='SELL'){if(a.level===0)return 'Tidak ada bangunan.';if(a.level<Math.max(...all.map(x=>x.level)))return 'Jual bangunan secara merata.';if(a.level===5&&stock(s).houses<4)return 'Bank membutuhkan 4 rumah untuk menurunkan hotel.'}
 if(action==='SELL_SET'){if(t.group<0||!all.some(x=>x.level>0))return 'Tidak ada bangunan dalam kelompok.';}
 if(action==='MORTGAGE'){if(a.mortgaged)return 'Sudah digadai.';if(all.some(x=>x.level>0))return 'Jual semua bangunan dalam kelompok dahulu.'}
 if(action==='REDEEM'){if(!a.mortgaged)return 'Aset tidak digadai.';if(s.players[p].cash<Math.ceil(t.mortgage*1.1))return 'Kas tidak cukup.'}
 return null;
}
function manage(s,p,id,type){let error=managementError(s,p,id,type);if(error)fail(error);const t=BOARD[id],a=s.assets[id],player=s.players[p];if(type==='BUILD'){player.cash-=t.build;a.level++;note(s,`${player.name} membangun ${a.level===5?'hotel':'rumah '+a.level} di ${t.name}.`,'build')}if(type==='SELL'){player.cash+=t.build/2;a.level--;note(s,`${player.name} menjual bangunan ${t.name}.`,'money')}if(type==='SELL_SET'){for(const tid of GROUPS[t.group].ids){let item=s.assets[tid];player.cash+=BOARD[tid].build*item.level/2;item.level=0}note(s,`${player.name} menjual semua bangunan kelompok ${GROUPS[t.group].name}.`,'money')}if(type==='MORTGAGE'){player.cash+=t.mortgage;a.mortgaged=true;note(s,`${player.name} menggadaikan ${t.name}: +${money(t.mortgage)}.`,'money')}if(type==='REDEEM'){player.cash-=Math.ceil(t.mortgage*1.1);a.mortgaged=false;note(s,`${player.name} menebus ${t.name}.`,'money')}s.bank=stock(s)}
function nextTurn(s){s.doubles=0;s.extra=false;do{s.turn=(s.turn+1)%s.players.length;if(s.turn===0)s.round++}while(s.players[s.turn].out);s.phase=current(s).inJail?'jail':'roll';note(s,`Giliran ${current(s).name}.`,'turn')}
function bankrupt(s,id){const d=s.debt,p=s.players[id];requireRule(d&&d.from===id,'Tidak ada utang yang harus diselesaikan.');const liquidation=p.cash+assets(s,id).reduce((n,t)=>n+(s.assets[t.id].mortgaged?0:t.mortgage)+(t.build||0)*s.assets[t.id].level/2,0);requireRule(liquidation<d.amount,'Aset masih cukup untuk melunasi utang. Jual bangunan atau gadaikan dahulu.');let receiver=d.to!==null&&!s.players[d.to].out?s.players[d.to]:null;let acquired=[],interest=0;
 for(const t of assets(s,id)){let a=s.assets[t.id];p.cash+=(t.build||0)*a.level/2;a.level=0;a.owner=receiver?receiver.id:null;if(receiver&&a.mortgaged)interest+=Math.ceil(t.mortgage*.1);if(!receiver){a.mortgaged=false;acquired.push(t.id)}}
 if(receiver){receiver.cash+=p.cash;receiver.cards.push(...p.cards)}else for(const c of p.cards)s.decks[c.deck].push(c.idx);p.cards=[];p.cash=0;p.out=true;note(s,`${p.name} bangkrut${receiver?' kepada '+receiver.name:' kepada bank'}.`,'bankrupt');s.debt=null;
 s.queue=s.queue.filter(q=>q.from!==id&&q.player!==id);if(interest)s.queue.unshift({kind:'pay',from:receiver.id,to:null,amount:interest,label:'bunga penerimaan aset tergadai'});
 s.queue.push(...acquired.map(tile=>({kind:'auction',tile})));if(alive(s).length===1){s.phase='won';s.winner=alive(s)[0].id;s.queue=[];return}if(id===s.turn){s.extra=false;s.doubles=0}s.bank=stock(s);resolve(s);if(s.phase==='end'&&current(s).out)nextTurn(s);
}
function tradeCheck(s,t){requireRule(t.from!==t.to&&s.players[t.to]&&!s.players[t.to].out,'Pilih pemain lain.');for(const n of [t.giveCash,t.takeCash,t.giveCards,t.takeCards])requireRule(integer(n),'Nilai penawaran tidak valid.');requireRule(Array.isArray(t.give)&&Array.isArray(t.take),'Pilih aset.');requireRule(new Set([...t.give,...t.take]).size===t.give.length+t.take.length,'Aset tidak boleh duplikat.');
 for(const [ids,owner] of [[t.give,t.from],[t.take,t.to]])for(const id of ids){let a=s.assets[id],tile=BOARD[id];requireRule(a&&a.owner===owner,'Kepemilikan aset telah berubah.');requireRule(tile.group<0||GROUPS[tile.group].ids.every(i=>s.assets[i].level===0),'Jual bangunan kelompok sebelum barter.')}
 requireRule(s.players[t.from].cards.length>=t.giveCards&&s.players[t.to].cards.length>=t.takeCards,'Kartu tidak tersedia.');let feeFrom=t.take.reduce((n,id)=>n+(s.assets[id].mortgaged?Math.ceil(BOARD[id].mortgage*.1):0),0),feeTo=t.give.reduce((n,id)=>n+(s.assets[id].mortgaged?Math.ceil(BOARD[id].mortgage*.1):0),0);
 requireRule(s.players[t.from].cash>=t.giveCash&&s.players[t.to].cash>=t.takeCash,'Kas penawaran tidak cukup.');requireRule(s.players[t.from].cash-t.giveCash+t.takeCash>=feeFrom&&s.players[t.to].cash-t.takeCash+t.giveCash>=feeTo,'Kas tidak cukup untuk bunga aset tergadai.');return {feeFrom,feeTo};
}
export function command(input,actor,a,rng=secureRandom){requireRule(input?.schemaVersion===1,'Save tidak kompatibel.');if(a.id&&input.seen.includes(a.id))return input;requireRule(a.expectedVersion===undefined||a.expectedVersion===input.version,'State berubah. Coba lagi.');requireRule(input.phase!=='won','Pertandingan selesai.');requireRule(input.players[actor]&&!input.players[actor].out,'Pemain tidak aktif.');let s=structuredClone(input);s._rng=rng;let p=s.players[actor],active=actor===s.turn;
 if(['BUILD','SELL','SELL_SET','MORTGAGE','REDEEM'].includes(a.type)){requireRule(['roll','end','jail','debt'].includes(s.phase),'Selesaikan keputusan yang sedang berlangsung.');requireRule(s.phase!=='debt'||actor===s.debt.from,'Pemain berutang sedang mengelola aset.');requireRule(s.phase!=='debt'||['SELL','SELL_SET','MORTGAGE'].includes(a.type),'Lunasi utang lebih dahulu.');manage(s,actor,a.tile,a.type)}
 else if(a.type==='ROLL'){requireRule(active&&['roll','jail'].includes(s.phase),'Belum waktunya melempar dadu.');let d=[rollDie(rng),rollDie(rng)],sum=d[0]+d[1],double=d[0]===d[1];s.dice=d;note(s,`${p.name} melempar ${d[0]} + ${d[1]}${double?' · kembar':''}.`,'dice');s.extra=false;
 if(p.inJail){p.jail++;if(double){p.inJail=false;p.jail=0;move(s,p,sum);s.queue.push({kind:'land',player:actor});resolve(s)}else if(p.jail>=3){s.queue.push({kind:'pay',from:actor,to:null,amount:500,label:'denda penjara'},{kind:'releaseMove',player:actor,steps:sum});resolve(s)}else s.phase='end'}
 else {s.doubles=double?s.doubles+1:0;if(s.doubles===3){jail(s,p);s.phase='end'}else{s.extra=double;move(s,p,sum);s.queue.push({kind:'land',player:actor});resolve(s)}}}
 else if(a.type==='JAIL_PAY'||a.type==='JAIL_CARD'){requireRule(active&&s.phase==='jail','Bukan keputusan penjara.');if(a.type==='JAIL_PAY'){requireRule(p.cash>=500,'Kas tidak cukup.');p.cash-=500;note(s,`${p.name} membayar Rp500 untuk keluar penjara.`,'money')}else{requireRule(p.cards.length>0,'Tidak punya kartu bebas penjara.');let c=p.cards.shift();s.decks[c.deck].push(c.idx)}p.inJail=false;p.jail=0;s.phase='roll'}
 else if(a.type==='BUY'){requireRule(active&&s.phase==='buy','Tidak ada properti yang ditawarkan.');let t=BOARD[s.buy];requireRule(p.cash>=t.price,'Kas tidak cukup; properti harus dilelang.');p.cash-=t.price;s.assets[t.id].owner=actor;note(s,`${p.name} membeli ${t.name} seharga ${money(t.price)}.`,'buy');resolve(s)}
 else if(a.type==='AUCTION'){requireRule(active&&s.phase==='buy','Tidak ada properti yang ditawarkan.');startAuction(s,s.buy)}
 else if(a.type==='BID'||a.type==='PASS'){requireRule(s.phase==='auction'&&s.auction.bidder===actor,'Tunggu giliran menawar.');let auction=s.auction;if(a.type==='BID'){requireRule(integer(a.amount)&&a.amount>auction.amount&&a.amount>=100,'Tawaran minimal Rp100 dan harus lebih tinggi.');requireRule(a.amount<=p.cash,'Kas tidak cukup untuk tawaran.');auction.amount=a.amount;auction.highest=actor;note(s,`${p.name} menawar ${money(a.amount)}.`,'auction')}else auction.participants=auction.participants.filter(i=>i!==actor);advanceAuction(s)}
 else if(a.type==='ACK'){requireRule(s.phase==='card'&&s.card.player===actor,'Bukan kartumu.');cardEffect(s)}
 else if(a.type==='PAY'){requireRule(s.phase==='debt'&&s.debt.from===actor,'Bukan utangmu.');let d=s.debt;requireRule(p.cash>=d.amount,'Dana belum cukup. Jual bangunan atau gadaikan aset.');s.debt=null;transfer(s,d.from,d.to,d.amount,d.label);resolve(s);if(s.phase==='end'&&current(s).out)nextTurn(s)}
 else if(a.type==='BANKRUPT'){requireRule(s.phase==='debt','Tidak ada utang.');bankrupt(s,actor)}
 else if(a.type==='END'){requireRule(active&&s.phase==='end','Selesaikan keputusan dahulu.');nextTurn(s)}
 else if(a.type==='OFFER'){requireRule(active&&['roll','end','jail'].includes(s.phase),'Barter hanya pada jeda giliranmu.');let t={...a.trade,from:actor,returnPhase:s.phase};tradeCheck(s,t);p.lastOfferRound=s.round;s.trade=t;s.phase='trade';note(s,`${p.name} mengajukan barter kepada ${s.players[t.to].name}.`,'trade')}
 else if(a.type==='COUNTER'){requireRule(s.phase==='trade'&&s.trade.to===actor,'Hanya penerima yang dapat membuat tawaran balik.');let t={...a.trade,from:actor,to:s.trade.from,returnPhase:s.trade.returnPhase};tradeCheck(s,t);s.trade=t;note(s,`${p.name} mengajukan penawaran balik.`,'trade')}
 else if(a.type==='TRADE_ACCEPT'||a.type==='TRADE_REJECT'){requireRule(s.phase==='trade'&&(s.trade.to===actor||(a.type==='TRADE_REJECT'&&s.trade.from===actor)),'Bukan keputusan bartermu.');let t=s.trade;if(a.type==='TRADE_ACCEPT'){let fees=tradeCheck(s,t);s.players[t.from].cash+=t.takeCash-t.giveCash-fees.feeFrom;s.players[t.to].cash+=t.giveCash-t.takeCash-fees.feeTo;t.give.forEach(i=>s.assets[i].owner=t.to);t.take.forEach(i=>s.assets[i].owner=t.from);let given=s.players[t.from].cards.splice(0,t.giveCards),taken=s.players[t.to].cards.splice(0,t.takeCards);s.players[t.from].cards.push(...taken);s.players[t.to].cards.push(...given);note(s,'Barter disetujui. Semua aset berpindah serentak.','trade')}else note(s,'Tawaran barter ditolak.','trade');s.phase=t.returnPhase;s.trade=null}
 else fail('Aksi tidak dikenal.');if(s.phase==='end'&&current(s).out)nextTurn(s);delete s._rng;s.version++;if(a.id)s.seen=[...s.seen.slice(-99),a.id];s.bank=stock(s);return s;
}
export function decisionActor(s){return s.phase==='auction'?s.auction.bidder:s.phase==='debt'?s.debt.from:s.phase==='card'?s.card.player:s.phase==='trade'?s.trade.to:s.turn}
export function publicState(s){let {decks,seen,...publicData}=structuredClone(s);return publicData}
