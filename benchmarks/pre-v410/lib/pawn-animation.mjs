import {pawnPoint,pawnPlacement} from './pawn-layout.mjs';
import {tokenPoint} from './board-camera.mjs';
/** Creates a visible, step-by-step path from the engine's authoritative move event. */
export function pawnRoute(move,state){
 if(move?.approach)return pawnRoute(move.approach,state);
 if(!move||move.jump||!Array.isArray(move.path)||!move.path.length)return [];
 if(!Number.isInteger(move.player))return [];
 const from=Number.isInteger(move.from)?move.from:((move.path[0]+39)%40);
 const points=[from,...move.path].map(tile=>tokenPoint(tile,move.player));
 if(state?.players?.[move.player]){
  // Reconstruct the starting cluster without mutating the authoritative snapshot.
  const before={players:state.players.map(p=>p.id===move.player?{...p,pos:from}:p)};
  points[0]=pawnPoint(before,move.player);
  points[points.length-1]=pawnPoint(state,move.player,move.path.at(-1));
 }
 return points;
}
export function samplePawnRoute(points,elapsed,stepMs){
 if(points.length<2)return null;
 const progress=Math.max(0,elapsed)/Math.max(1,stepMs),segment=Math.min(Math.floor(progress),points.length-2),t=Math.max(0,Math.min(1,progress-segment)),ease=t;
 // Cubic tangents carry momentum through corners without stopping at every tile.
 const a=points[Math.max(0,segment-1)],b=points[segment],c=points[segment+1],d=points[Math.min(points.length-1,segment+2)];
 const curve=key=>{const p0=segment===0?2*b[key]-c[key]:a[key],p3=segment+2>=points.length?2*c[key]-b[key]:d[key];return .5*(2*b[key]+(-p0+c[key])*ease+(2*p0-5*b[key]+4*c[key]-p3)*ease**2+(-p0+3*b[key]-3*c[key]+p3)*ease**3)};
 return {x:curve('x'),y:curve('y'),step:Math.min(points.length-1,Math.floor(progress)),done:progress>=points.length-1};
}

/** Presentation scale only: preserve crowded starting slots before growing into a walk. */
export function pawnMotionScale(move,state,progress){
 const m=move?.approach||move,p=state?.players?.[m?.player];
 if(!p||!Array.isArray(m.path)||!m.path.length)return 1;
 const from=Number.isInteger(m.from)?m.from:(m.path[0]+39)%40;
 const before={players:state.players.map(player=>player.id===m.player?{...player,pos:from}:player)};
 const base=pawnPlacement(state,m.player).size,start=pawnPlacement(before,m.player).size/base,end=pawnPlacement(state,m.player,m.path.at(-1)).size/base,walk=38/base;
 const t=Math.max(0,Math.min(m.path.length,progress));
 if(m.path.length===1)return start+(end-start)*t;
 if(t<1)return start+(walk-start)*t;
 if(t>m.path.length-1)return walk+(end-walk)*(t-m.path.length+1);
 return walk;
}

export function pawnStepTiming(distance,{fast=false,reduced=false}={}){return reduced?1:Math.min(fast?90:140,(fast?1100:1800)/Math.max(1,distance))}
