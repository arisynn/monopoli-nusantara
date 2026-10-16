import {decideMind} from './mind.mjs';
self.onmessage=event=>{
 const {id,state,actor,options}=event.data;
 try{self.postMessage({id,matchId:state.matchId,stateVersion:state.version,actor,plan:decideMind(state,actor,options)});}
 catch{self.postMessage({id,error:'local_search_failed'});}
};
