import assert from 'node:assert/strict';
import {createGame,command} from '../lib/game.mjs';
import {ComputePool} from './pool.mjs';
import {MODEL_RELEASE} from '../lib/bot/model-manifest.mjs';
const pool=new ComputePool(1);let decisions=0;
try{
 for(const persona of ['nusa','kresna','apex','raka','bima','sari']){
  let s=createGame({players:[{name:persona,controller:'bot',botPersona:persona},{name:'Other',controller:'human'}],startingRoll:false},()=>.2);
  s.phase='buy';s.buy=39;s=command(s,0,{type:'AUCTION'},()=>.2);s.auction.amount=110;s.auction.highest=1;
  const plan=await pool.compute({state:s,actor:0,budget:64});assert(plan.action);
  if(plan.action.type==='BID')assert.equal(plan.action.amount%50,0);
  assert.doesNotThrow(()=>command(s,0,plan.action,()=>.2));decisions++;
 }
 console.log(`PASS ${MODEL_RELEASE}: ${decisions} persona, compute thread, engine legality, kelipatan bid ₦5.`);
}finally{await pool.close();}
