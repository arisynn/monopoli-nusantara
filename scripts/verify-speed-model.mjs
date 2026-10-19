import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODEL_FILES,MODEL_MANIFEST_ID} from '../lib/bot/model-manifest.mjs';
if(MODEL_MANIFEST_ID!=='f398a9793efd23c3c74e3e46d89aab0117a4c23c5102036d7e8f77a51c94e46d')throw Error('V23.2 manifest changed');
if(createHash('sha256').update(await readFile(new URL('../lib/bot/model-manifest.mjs',import.meta.url))).digest('hex')!=='135a4360b9c278f06ccf793ac1fac1f660a907110d05d9f12c8e48eb7414cbe0')throw Error('Manifest file bytes changed');
for(const [file,hash]of Object.entries(MODEL_FILES))if(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')!==hash)throw Error('Protected model/engine changed: '+file);
console.log('V23.2 model/engine unchanged: '+Object.keys(MODEL_FILES).length+' file hashes verified.');
