import {decidePersona} from './persona-router.mjs';
self.onmessage=event=>{
 const {id,state,actor,options}=event.data;
 try{self.postMessage({id,matchId:state.matchId,stateVersion:state.version,actor,plan:decidePersona(state,actor,options)});}
 catch{self.postMessage({id,error:'local_search_failed'});}
};
