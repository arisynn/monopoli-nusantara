import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGame,command} from '../lib/game.mjs';
import {tokenPoint,tileCenter,closeCamera,keepPointVisible} from '../lib/board-camera.mjs';
import {pawnRoute,samplePawnRoute} from '../lib/pawn-animation.mjs';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const roll=(...values)=>{let index=0;return ()=>{if(index>=values.length)throw Error('Not enough dice draws');return values[index++]}};
test('opening rolls decide who starts without moving a pawn',()=>{
 let s=createGame({players:[{name:'A'},{name:'B'}]},()=>.4);assert.equal(s.phase,'starting');
 const before=s.players.map(p=>p.pos);let a=command(s,0,{type:'START_ROLL'},roll(.2,.3));
 assert.deepEqual(a.players.map(p=>p.pos),before);assert.equal(a.lastMove,null);
 a=command(a,1,{type:'START_ROLL'},roll(.6,.8));assert.deepEqual(a.players.map(p=>p.pos),before);assert.equal(a.phase,'roll');assert.equal(a.turn,1);
});
test('a normal gameplay roll contains a real path and sample traverses the intermediate squares',()=>{
 let s=createGame({players:[{name:'A'},{name:'B'}],startingRoll:false},()=>.2);s=command(s,0,{type:'ROLL'},roll(.1,.22));
 assert.deepEqual(s.dice,[1,2]);assert.deepEqual(s.lastMove.path,[1,2,3]);
 const points=pawnRoute(s.lastMove);assert.equal(points.length,4);assert.deepEqual(points[0],tokenPoint(0,0));
 assert.deepEqual(points.at(-1),tokenPoint(3,0));
 assert.deepEqual(samplePawnRoute(points,0,225),{...points[0],step:0,done:false});
 assert.equal(samplePawnRoute(points,225,225).step,1);
 assert.equal(samplePawnRoute(points,675,225).done,true);
});
test('jail jump does not traverse a fake path, and reverse moves use exact engine event sequence',()=>{
 assert.deepEqual(pawnRoute({jump:true,path:[10],player:0}),[]);
 const points=pawnRoute({from:1,path:[0,39],player:2});assert.deepEqual(points,[tokenPoint(1,2),tokenPoint(0,2),tokenPoint(39,2)]);
});
test('following camera maintains a dead zone and moves only to keep the pawn visible',()=>{
 const c=closeCamera(390,340,tileCenter(0));const start=tokenPoint(0,0);
 assert.deepEqual(keepPointVisible(c,start),c);
 const target=tokenPoint(7,0),next=keepPointVisible(c,target);
 assert.notDeepEqual({x:next.x,y:next.y},{x:c.x,y:c.y});
 const screen={x:target.x*next.scale+next.x,y:target.y*next.scale+next.y};
 assert(screen.x>=-0.001&&screen.x<=390.001);assert(screen.y>=-0.001&&screen.y<=340.001);
});
test('game UI freezes decisions while pawn moves and tells players what the first roll does',()=>{
 const game=read('../components/game/Game.tsx'),board=read('../components/game/Board.tsx');
 assert(game.includes('if(travelIdRef.current!==null)'));assert(game.includes('onMoveComplete={id=>'));
 assert(board.includes('samplePawnRoute'));assert(board.includes('keepPointVisible'));
 const rules=read('../components/game/RuleActions.tsx');
 assert(rules.includes('Semua pion tetap di Mulai'));
});
