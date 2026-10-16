export type BotReason = 'not_configured'|'simple'|'budget'|'circuit_open'|'timeout'|'unauthorized'|'forbidden'|'rate_limited'|'provider_error'|'invalid_response'|'illegal_action'|'economic_guard'|'network_error';
export type BotStatus = 'local'|'configured'|'consulting'|'hybrid'|'fallback';
export interface BotTrade {to:number;give:number[];take:number[];giveCash:number;takeCash:number;giveCards:number;takeCards:number}
export interface BotAction {type:string;tile?:number;amount?:number;cardIndex?:number;claimId?:string;trade?:BotTrade;actionId?:string}
export interface BotDecisionResult {
 action:BotAction;
 status:BotStatus;
 comment:string|null;
 /** Safe diagnostic enum only. Never contains provider body, headers or a stack. */
 reason?:BotReason;
 stateVersion:number;
 matchId:string;
 actor:number;
 advisorUsed:boolean;
 usage?:{totalTokens:number;latencyMs:number};
}
export interface BotEnvironment {GROQ_API_KEY?:string;GROQ_MODEL?:string;GROQ_TIMEOUT_MS?:string;GROQ_DAILY_BUDGET?:string;[key:string]:unknown}
export interface BotGameState {
 schemaVersion:number;matchId:string;version:number;phase:string;
 players:Array<{id:number;name:string;controller:string;cash:number;pos:number;inJail:boolean;out:boolean;botPersona?:string;[key:string]:unknown}>;
 assets:Record<string,unknown>;aiStatus?:string;aiComment?:string|null;
 [key:string]:unknown;
}
