export type VisualPhase='idle'|'diceRolling'|'diceResult'|'pawnMoving'|'tileArrival'|'eventRevealing'|'financialSettlement';
export interface PublicCard {deck:string;idx:number;player:number;title:string;text:string;revealId?:number;[key:string]:unknown}
export interface PublicMove {id:number;player:number;from?:number;path:number[];jump?:boolean;approach?:PublicMove}
export interface FinanceTransaction {kind:string;from:number|null;to:number|null;amount:number;tile?:number;card?:{deck:string;idx:number;title:string}}
export interface AssetChange {tile:number;owner:number|null;level:number;mortgaged:boolean}
export interface PublicLogEvent {id:number;text:string;type:string;turn:number;version?:number;actor?:number;audience?:string;dice?:number[];diceKind?:string;move?:PublicMove;card?:PublicCard;finance?:FinanceTransaction[];assetChanges?:AssetChange[];[key:string]:unknown}
export interface PresentedPlayer {id:number;name:string;cash:number;pos:number;controller:string;inJail:boolean;out:boolean;[key:string]:unknown}
export interface PresentedGame {matchId:string;version:number;eventId:number;phase:string;turn:number;players:PresentedPlayer[];assets:Record<string,{owner:number|null;level:number;mortgaged:boolean}>;dice:number[];log:PublicLogEvent[];lastMove?:PublicMove|null;card?:PublicCard|null;[key:string]:unknown}
export interface PresentationEvent {id:string;logId:number;type:string;title:string;text:string;actor:number;card?:PublicCard;auctionResult?:{auctionId:string;kind:string;building:string|null;tile:number|null;winner:number|null;amount:number;participants:number[]}}
export interface VisualStep {id:string;kind:VisualPhase|'snapshot'|'asset';actor?:number;dice?:number[];diceKind?:string;move?:PublicMove;event?:PresentationEvent;finance?:FinanceTransaction;assetChanges?:AssetChange[];source?:PublicLogEvent;snapshot?:PresentedGame}
export interface TimelineModel {cursor:{match:string;version:number;eventId:number};epoch:number;enabled:boolean;view:PresentedGame;queue:VisualStep[];recovered?:boolean;notice?:{id:string;text:string}}
