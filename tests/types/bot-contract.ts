import {aiDecision,localDecision} from '../../lib/groq';
import {createGame} from '../../lib/game.mjs';
import type {BotDecisionResult,BotGameState} from '../../lib/bot/contracts';
import type {MindPlan,MindClient} from '../../lib/bot/contracts';
import {decideMind} from '../../lib/bot/mind.mjs';
import {createMindClient} from '../../lib/bot/mind-client.mjs';
// Included by tsc --noEmit. All branches have the shared optional diagnostic field.
export async function contractRegression(state:BotGameState){
 const configured:BotDecisionResult=await aiDecision(state,1,{});
 const fallback:BotDecisionResult=localDecision(state,1,'timeout');
 const messages=[configured.reason??null,fallback.reason??null];
 const created=createGame({players:[{name:'Human'},{name:'Raka',controller:'bot'}]});
 created.aiComment='Komentar aman';created.aiComment=null;
 return {messages,comment:created.aiComment};
}
export function mindContract(state:BotGameState){
 const plan:MindPlan=decideMind(state,1,{difficulty:'hardcore',timeBudgetMs:200});
 const client:MindClient=createMindClient();
 return {plan,client};
}
