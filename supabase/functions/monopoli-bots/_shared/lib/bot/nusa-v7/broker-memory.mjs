import {BOARD,GROUPS} from '../../content.mjs';

// Only confirmed engine commands advance this private, same-turn intention.
// No hypothetical rollout or observation is allowed to write authoritative memory.
export function recordBrokerMemory(state,previous,actor,action,memory){
  memory.players||={};
  for(const p of state.players){
    if(p.botPersona!=='nusa')continue;
    const own=memory.players[p.id]||={lastOfferSerial:-100,lastSignature:'',rejections:{}};
    if(own.nusaTradeTurnSerial!==state.turnSerial){
      own.nusaTradeTurnSerial=state.turnSerial;
      own.nusaTurnTradeCount=0;
    }
    let chain=own.nusaBroker;
    if(chain&&(p.out||chain.matchId!==state.matchId||chain.turnSerial!==state.turnSerial||state.turn!==p.id||state.phase==='won')){
      delete own.nusaBroker;chain=null;
    }
    if(p.id===actor&&action.type==='OFFER'&&state.turn===p.id)own.nusaTurnTradeCount++;
    if(p.id===actor&&action.type==='END'){delete own.nusaBroker;continue;}

    if(p.id===actor&&action.type==='OFFER'){
      const match=/^nusa-(?:2hop-broker-step1|broker-step2)-(\d+)-for-(\d+)/.exec(action.actionId||'');
      if(match){
        const baitTile=Number(match[1]),ultimateTargetTile=Number(match[2]);
        const targetGroupId=BOARD[ultimateTargetTile]?.group;
        const keyHolderId=previous.assets[ultimateTargetTile]?.owner;
        const step1=action.actionId.startsWith('nusa-2hop-broker-step1-');
        if(targetGroupId>=0&&Number.isInteger(keyHolderId)&&keyHolderId!==p.id&&
           (step1?action.trade.take.includes(baitTile):action.trade.give.includes(baitTile)&&action.trade.take.includes(ultimateTargetTile))){
          own.nusaBroker={stage:step1?'awaiting_step1':'awaiting_step2',baitTile,ultimateTargetTile,
            keyHolderId,targetGroupId,turnSerial:state.turnSerial,matchId:state.matchId};
          chain=own.nusaBroker;
        }
      }else if(chain&&chain.stage!=='develop'){
        delete own.nusaBroker;chain=null;
      }
    }
    if(!chain)continue;
    const participants=[previous.trade?.from,previous.trade?.to];
    if(participants.includes(p.id)&&action.type==='TRADE_REJECT'){
      delete own.nusaBroker;continue;
    }
    if(participants.includes(p.id)&&action.type==='COUNTER'){
      // Direction may reverse. Continue only if the promised acquisition survives.
      const t=state.trade;
      const receives=t?.to===p.id?t.give:t?.from===p.id?t.take:[];
      const expected=chain.stage==='awaiting_step1'?chain.baitTile:chain.ultimateTargetTile;
      if(!receives?.includes(expected)){delete own.nusaBroker;continue;}
    }
    if(participants.includes(p.id)&&action.type==='TRADE_ACCEPT'){
      if(chain.stage==='awaiting_step1'){
        if(state.assets[chain.baitTile]?.owner===p.id&&state.assets[chain.ultimateTargetTile]?.owner===chain.keyHolderId)
          chain.stage='ready_step2';
        else{delete own.nusaBroker;continue;}
      }else if(chain.stage==='awaiting_step2'){
        if(GROUPS[chain.targetGroupId].ids.every(id=>state.assets[id]?.owner===p.id))chain.stage='develop';
        else{delete own.nusaBroker;continue;}
      }
    }
    if(chain.stage==='ready_step2'&&(state.assets[chain.baitTile]?.owner!==p.id||state.assets[chain.ultimateTargetTile]?.owner!==chain.keyHolderId)){
      delete own.nusaBroker;continue;
    }
    if(chain.stage==='develop'){
      const ids=GROUPS[chain.targetGroupId].ids;
      if(!ids.every(id=>state.assets[id]?.owner===p.id)||ids.every(id=>!state.assets[id].mortgaged&&state.assets[id].level>=3))delete own.nusaBroker;
    }
  }
}
