import {nusaText} from './currency.mjs';
/** Ordinary events belong in History. Only actionable rejection gets inline feedback. */
export function summarizeNotices(list){
 const rejected=list.filter(e=>e.type==='trade'&&/ditolak|dibatalkan/.test(e.text));
 const event=rejected.at(-1);
 return event?{id:event.id,text:nusaText(event.text),detail:true,kind:'warning',duration:3200}:null;
}
