import {money,BOARD} from './content.mjs';
/** Metadata for money already committed by command(). Never performs a transfer. */
export const moneyData=(kind,from,to,amount,context={})=>({finance:amount>0?[{kind,from,to,amount,...context}]:[]});
export const assetData=(s,tiles)=>({assetChanges:tiles.map(tile=>({tile,...s.assets[tile]}))});
export function transactionDeltas(transaction){
 if(!transaction||!Number.isSafeInteger(transaction.amount)||transaction.amount<=0)return [];
 const changes=[];
 if(Number.isInteger(transaction.from))changes.push({player:transaction.from,amount:-transaction.amount});
 if(Number.isInteger(transaction.to))changes.push({player:transaction.to,amount:transaction.amount});
 return changes;
}
/** @type {Record<string,string>} */
export const financeLabels={rent:'Sewa',purchase:'Pembelian',auction:'Lelang',salary:'Melewati Mulai',tax:'Pajak',card:'Kartu',repair:'Perbaikan',build:'Pembangunan',sell:'Penjualan bangunan',mortgage:'Gadai',redeem:'Tebus gadai',interest:'Bunga',trade:'Barter',jail:'Penjara',liquidation:'Likuidasi',bankruptcy:'Penyelesaian bangkrut',payment:'Pembayaran'};
/**
 * @param {import('./presentation-types.ts').PublicLogEvent} event
 * @param {import('./presentation-types.ts').PresentedPlayer[]} players
 * @returns {Array<{id:string;player:number;amount:number;kind:string;text:string}>}
 */
export function financeRows(event,players){
 return (event.finance||[]).flatMap((t,index)=>transactionDeltas(t).map(d=>({id:`${event.id}:${index}:${d.player}`,player:d.player,amount:d.amount,kind:t.kind,
  text:`${players[d.player]?.name||'Pemain'} ${d.amount<0?'membayar':'menerima'} ${financeLabels[t.kind]?.toLowerCase()||'transaksi'}${t.tile!==undefined?' '+BOARD[t.tile]?.name:''}${t.card?.title?' · '+t.card.title:''}${d.amount<0&&t.to!==null?' kepada '+(players[t.to]?.name||'pemain'):d.amount>0&&t.from!==null?' dari '+(players[t.from]?.name||'pemain'):''}: ${d.amount<0?'−':'+'} ${money(Math.abs(d.amount))}`
 })));
}
