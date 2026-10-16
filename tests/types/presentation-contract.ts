import {createGame} from '../../lib/game.mjs';
import {ingestTimeline,presentedState} from '../../lib/presentation-timeline.mjs';
import type {PresentedGame,FinanceTransaction,VisualStep} from '../../lib/presentation-types';
const game:PresentedGame=createGame({players:[{name:'Jovan'},{name:'Raka',controller:'bot'}]});
const model=ingestTimeline(null,game);
const projected:PresentedGame|null=presentedState(model);
const payment:FinanceTransaction={kind:'rent',from:0,to:1,amount:1200};
const step:VisualStep={id:'match:event:finance',kind:'financialSettlement',finance:payment};
export {projected,step};
