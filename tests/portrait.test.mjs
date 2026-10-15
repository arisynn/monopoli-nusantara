import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {coords,fitCamera,BOARD_SIZE} from '../lib/board-camera.mjs';
import {createGame} from '../lib/game.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../components/game/MobileDock.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const component={exports:{}};
new Function('require','module','exports',code)(id=>require(id.startsWith('@/')?'../'+id.slice(2):id),component,component.exports);
const Dock=component.exports.default;
function buttons(node){if(!node||typeof node!=='object')return [];return [...(node.type==='button'?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(buttons)]}
const text=node=>typeof node==='string'?node:typeof node==='number'?String(node):node&&typeof node==='object'?[node.props?.children].flat(Infinity).map(text).join(''):'';
function render(phase,extra={}){const s={...createGame({players:[{name:'Jovan'},{name:'Raka'}]}),phase,...extra};const actions=[],details=[];const element=Dock({s,actor:0,human:true,busy:false,rolling:false,paused:false,act:type=>actions.push(type),onDetails:()=>details.push(true),onResume(){},onNew(){}});return {s,element,buttons:buttons(element),actions,details}}

test('board keeps the original 40 unique perimeter positions and four corners',()=>{
 const all=Array.from({length:40},(_,i)=>coords(i));assert.equal(new Set(all.map(String)).size,40);
 assert.deepEqual([coords(0),coords(10),coords(20),coords(30)],[[5,5],[-5,5],[-5,-5],[5,-5]]);
 for(let i=0;i<40;i++){const next=all[(i+1)%40];assert.equal(Math.abs(all[i][0]-next[0])+Math.abs(all[i][1]-next[1]),1)}
});
test('2D overview contains the entire board in tall, short and narrow viewports',()=>{
 for(const [width,height] of [[304,150],[344,230],[374,354],[396,420],[414,460],[684,850],[430,180],[350,90]]){
  const c=fitCamera(width,height);assert(c.x>=0&&c.y>=0);assert(c.x+BOARD_SIZE*c.scale<=width);assert(c.y+BOARD_SIZE*c.scale<=height);
 }
});
test('purchase buttons call the same engine commands and honor affordability',()=>{
 const dock=render('buy',{buy:6});assert(text(dock.element).includes('Yogyakarta'));const buy=dock.buttons.find(b=>text(b).includes('Beli'));assert.equal(buy.props.disabled,false);buy.props.onClick();dock.buttons.find(b=>text(b)==='Lelang').props.onClick();assert.deepEqual(dock.actions,['BUY','AUCTION']);
 dock.s.players[0].cash=0;const poor=Dock({s:dock.s,actor:0,human:true,busy:false,rolling:false,paused:false,act(){},onDetails(){}});assert.equal(buttons(poor).find(b=>text(b).includes('Beli')).props.disabled,true);
});
test('roll, initial roll and end remain directly reachable without opening a panel',()=>{
 for(const [phase,command] of [['starting','START_ROLL'],['roll','ROLL'],['end','END']]){const d=render(phase);d.buttons.at(-1).props.onClick();assert.deepEqual(d.actions,[command])}
});
test('every long decision has a reachable details action',()=>{
 const phases={card:{card:{deck:'chance',title:'Kartu perjalanan'}},auction:{auction:{tile:6,amount:100}},jail:{},debt:{debt:{amount:18000}},trade:{trade:{from:0,to:1}},mortgage:{mortgageDecision:{tile:6}},buildOffer:{buildOffer:{remaining:1,kind:'house'}}};
 for(const [phase,extra] of Object.entries(phases)){const d=render(phase,extra);d.buttons.at(-1).props.onClick();assert.equal(d.details.length,1,phase);assert.equal(d.actions.length,0)}
});
test('waiting players cannot issue a move from the compact dock',()=>{
 const d=render('roll'),actions=[];const el=Dock({s:d.s,actor:0,human:false,busy:false,rolling:false,paused:false,act:type=>actions.push(type),onDetails(){}});buttons(el).at(-1).props.onClick();assert.deepEqual(actions,[]);
});
