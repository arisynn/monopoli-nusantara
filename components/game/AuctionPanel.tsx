'use client';
import {BOARD,money} from '@/lib/content.mjs';
import {AuctionControls} from './RuleActions';
export default function AuctionPanel({s,result,myId,room,busy,bid,setBid,act,setSeat,onContinue,onAssets}:{s:any;result:any;myId:number;room:any;busy:boolean;bid:number;setBid:any;act:any;setSeat:any;onContinue:()=>void;onAssets:()=>void}){
 if(result){const property=result.tile===null?'Bangunan bank':BOARD[result.tile]?.name;return <div className="auction-panel auction-result" role="status"><small>LELANG SELESAI</small><h2>{result.winner===null?'Tanpa pemenang':s.players[result.winner]?.name}</h2><dl><div><dt>{result.kind==='building'?`Bangunan ${result.building==='house'?'rumah':'hotel'}`:'Properti'}</dt><dd>{property}</dd></div><div><dt>Harga akhir</dt><dd>{result.winner===null?'Tidak ada penawaran':money(result.amount)}</dd></div></dl><p>{result.winner===null?'Aset tetap di bank.':'Kepemilikan dan pembayaran sudah diselesaikan.'}</p><button type="button" className="primary" onClick={onContinue}>Lanjut</button></div>}
 if(s.phase!=='auction')return null;
 return <section className="auction-panel" aria-label="Lelang aktif"><AuctionControls s={s} myId={myId} room={room} busy={busy} bid={bid} setBid={setBid} act={act} setSeat={setSeat}/><button type="button" className="text-link" onClick={onAssets}>Kelola aset / pendanaan</button></section>;
}
