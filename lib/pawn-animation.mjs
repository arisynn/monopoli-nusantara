import {tokenPoint} from './board-camera.mjs';
/** Creates a visible, step-by-step path from the engine's authoritative move event. */
export function pawnRoute(move){
 if(!move||move.jump||!Array.isArray(move.path)||!move.path.length)return [];
 if(!Number.isInteger(move.player))return [];
 const from=Number.isInteger(move.from)?move.from:((move.path[0]+39)%40);
 return [from,...move.path].map(tile=>tokenPoint(tile,move.player));
}
export function samplePawnRoute(points,elapsed,stepMs){
 if(points.length<2)return null;
 const progress=Math.max(0,elapsed)/Math.max(1,stepMs),segment=Math.min(Math.floor(progress),points.length-2),t=Math.max(0,Math.min(1,progress-segment)),ease=t*t*(3-2*t);
 return {x:points[segment].x+(points[segment+1].x-points[segment].x)*ease,y:points[segment].y+(points[segment+1].y-points[segment].y)*ease,step:Math.min(points.length-1,Math.floor(progress)),done:progress>=points.length-1};
}
