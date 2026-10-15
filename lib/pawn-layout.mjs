import {tileRect,tileCenter} from './board-camera.mjs';
/** Symmetric local rows; all centers share the tile's exact geometric center. */
export function pawnSlot(tile,index=0,count=1){
 const r=tileRect(tile),c=tileCenter(tile),n=Math.max(1,Math.min(6,count)),i=Math.max(0,Math.min(n-1,index));
 const layouts=[[[0,0]],[[-17,0],[17,0]],[[-24,0],[0,0],[24,0]],[[-15,-12],[15,-12],[-15,12],[15,12]],[[-22,-12],[0,-12],[22,-12],[-14,18],[14,18]],[[-22,-12],[0,-12],[22,-12],[-22,12],[0,12],[22,12]]];
 const [x,y]=layouts[n-1][i],a=r.angle*Math.PI/180;
 return {x:c.x+x*Math.cos(a)-y*Math.sin(a),y:c.y+x*Math.sin(a)+y*Math.cos(a),size:n===1?38:n<=2?32:n===3?22:n===4?23:19};
}
export function pawnPlacement(state,player,tile=state.players[player]?.pos){
 const ids=state.players.filter(p=>!p.out&&(p.id===player||p.pos===tile)).map(p=>p.id).sort((a,b)=>a-b);
 return pawnSlot(tile,Math.max(0,ids.indexOf(player)),ids.length);
}
export function pawnPoint(state,player,tile){const {x,y}=pawnPlacement(state,player,tile);return {x,y}}
