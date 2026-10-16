import {createGame} from '../../lib/game.mjs';
import {ingestTimeline,presentedState,liveCardDecision} from '../../lib/presentation-timeline.mjs';
import {financeRows} from '../../lib/finance.mjs';
import type {PresentedGame,FinanceTransaction,VisualStep} from '../../lib/presentation-types';
const game:PresentedGame=createGame({players:[{name:'Jovan'},{name:'Raka',controller:'bot'}]});
const model=ingestTimeline(null,game);
const projected:PresentedGame|null=presentedState(model);
const payment:FinanceTransaction={kind:'rent',from:0,to:1,amount:1200};
const step:VisualStep={id:'match:event:finance',kind:'financialSettlement',finance:payment};
export {projected,step};
// P0 regression: a numbered online seat is valid, and ledger callbacks stay typed.
const allowed:boolean=liveCardDecision(null,game,1);
const historyRows:Array<{id:string;amount:number;text:string}>=financeRows({id:1,text:'rent',type:'money',turn:1,finance:[payment]},game.players);
export {allowed,historyRows};
