// Fixed-point denomination. Engine, save and wire values remain integer base units.
export const CURRENCY=Object.freeze({name:'Nusa',symbol:'₦',unitsPerNusa:10,precision:1});
export function money(units){
 if(!Number.isSafeInteger(units))return '₦ —';
 const digits=String(Math.abs(units)),whole=digits.slice(0,-1)||'0',fraction=digits.at(-1);
 return `₦ ${units<0?'-':''}${Number(whole).toLocaleString('id-ID')}${fraction!=='0'?','+fraction:''}`;
}
export const nusaInput=units=>{if(!Number.isSafeInteger(units))return '';const digits=String(Math.abs(units));return `${units<0?'-':''}${digits.slice(0,-1)||'0'}${digits.at(-1)!=='0'?'.'+digits.at(-1):''}`};
export function parseNusa(value){
 const text=String(value).trim().replace(',','.');
 if(text==='')return 0;
 if(!/^\d+(?:\.\d?)?$/.test(text))return null;
 const [whole,fraction='0']=text.split('.'),units=Number(whole)*10+Number(fraction||0);
 return Number.isSafeInteger(units)?units:null;
}
export function nusaText(text){return String(text??'').replace(/Rp\s*(\d+(?:\.\d{3})*)/g,(_,digits)=>money(Number(digits.replaceAll('.',''))))}
