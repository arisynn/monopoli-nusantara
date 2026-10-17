/** Stateless coordinate hash plus independent event counters per semantic stream.
 * Used only on sampled sandbox states. Never install this on a live game room. */
export function mix32(value){let h=value|0;h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);return (h^(h>>>16))>>>0;}
function textHash(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export class ScenarioRandom {
 constructor(seed){this.seed=seed>>>0;this.events=new Map();}
 uniform(turn,actor,channel,index=0){
  let h=mix32(this.seed^textHash(channel));h=mix32(h^mix32(turn));h=mix32(h^mix32(actor+1));return mix32(h^mix32(index))/4294967296;
 }
 stream(turn,actor,channel){
  const key=JSON.stringify([turn,actor,channel]),event=this.events.get(key)||0;this.events.set(key,event+1);let draw=0;
  return ()=>this.uniform(turn,actor,`${channel}:event:${event}`,draw++);
 }
 forAction(s,actor,action){
  const channel=action.type==='ROLL'?'movement-dice':action.type==='START_ROLL'?'opening-dice':action.type==='ACK'&&s.card?.utilityRoll?'utility-dice':`command:${action.type}`;
  return this.stream(s.turnSerial||0,actor,channel);
 }
 policy(s,actor){return this.stream(s.turnSerial||0,actor,`response:${s.phase}`);}
}
