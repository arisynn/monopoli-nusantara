import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const root=new URL('../benchmarks/frozen-v45/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('MANIFEST.json',root),'utf8'));
for(const [file,expected] of Object.entries(manifest.files)){
 const actual=createHash('sha256').update(readFileSync(new URL(file,root))).digest('hex');
 if(actual!==expected)throw Error('Frozen baseline modified: '+file);
}
console.log(`Frozen v4.5 baseline: ${Object.keys(manifest.files).length} hashes match.`);
