import {difficultyFor,MODELS,observation} from './mind.mjs';
import {decidePersona} from './persona-router.mjs';
/** Dedicated, cancellable local worker. Failures degrade to the economic policy, never network. */
/** @returns {import('./contracts.ts').MindClient} */
export function createMindClient(makeWorker=()=>new Worker(new URL('./mind.worker.mjs',import.meta.url),{type:'module'})){
 /** @type {Worker|null} */ let worker=null;let serial=0;
 /** @type {{cancel:()=>void}|null} */ let pending=null;
 const stop=()=>{worker?.terminate();worker=null;};
 /** @param {import('./contracts.ts').BotGameState} state
  * @param {number} actor
  * @param {{signal?:AbortSignal}} [options]
  * @returns {Promise<import('./contracts.ts').MindPlan|null>} */
 function decide(state,actor,{signal}={}){
  if(pending)pending.cancel();
  return new Promise(resolve=>{
   if(signal?.aborted){resolve(null);return;}
   const id=++serial,version=state.version,match=state.matchId;
   let done=false,timer;
   const finish=value=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);pending=null;resolve(value);};
   const cancel=()=>{stop();finish(null);};
   const fallback=()=>{if(done)return;stop();try{const plan=decidePersona(state,actor,{difficulty:'medium',timeBudgetMs:0});plan.diagnostics.workerFallback=true;finish(plan);}catch{finish(null);}};
   pending={cancel};signal?.addEventListener('abort',cancel,{once:true});
   try{
    worker||=makeWorker();
    worker.onmessage=event=>{if(done)return;const data=event.data;if(data.id!==id)return;if(data.error){fallback();return;}if(data.matchId!==match||data.stateVersion!==version||data.actor!==actor){cancel();return;}finish(data.plan);};
    worker.onerror=fallback;
    const budget=MODELS.find(m=>m.id===difficultyFor(state,actor)).budget;
    timer=setTimeout(fallback,Math.max(1600,budget+800));
    worker.postMessage({id,state:observation(state,actor),actor,options:{timeBudgetMs:budget}});
   }catch{fallback();}
  });
 }
 return {decide,dispose:()=>{pending?.cancel();stop();}};
}
