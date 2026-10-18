import {parentPort} from 'node:worker_threads';
import {decidePersona} from '../lib/bot/persona-router.mjs';
parentPort.on('message',({id,state,actor,budget})=>{
 try{const plan=decidePersona(state,actor,{timeBudgetMs:budget});parentPort.postMessage({id,plan});}
 catch{parentPort.postMessage({id,error:'Komputasi model gagal.'});}
});
