import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
export function mindProvenance(){
 const files=['lib/game.mjs','lib/content.mjs','lib/bank-economy.mjs','lib/finance.mjs','lib/currency.mjs',...readdirSync('lib/bot').filter(n=>n.endsWith('.mjs')&&n!=='learned-model.mjs').sort().map(n=>'lib/bot/'+n)];
 const hashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
 return {sourceHash:createHash('sha256').update(JSON.stringify(hashes)).digest('hex'),files:hashes};
}
export const modelHash=model=>createHash('sha256').update(JSON.stringify(model)).digest('hex');
