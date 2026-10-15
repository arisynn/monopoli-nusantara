import {nusaText} from '@/lib/currency.mjs';
import NusaText from './NusaText';
import {CardArt} from './AssetArt';
import type {ReactNode} from 'react';
export default function EventCard({card,impact}:{card:{deck:string;title:string;text:string};impact:ReactNode}){
 return <article className={`event-card nusa-event-card ${card.deck}`}><header><CardArt deck={card.deck}/><div><small>{card.deck==='chance'?'KESEMPATAN':'DANA UMUM'}</small><span>MONOPOLI NUSANTARA</span></div></header><h3>{card.title}</h3><p><NusaText text={nusaText(card.text)}/></p><div className="card-impact">{impact}</div></article>;
}
