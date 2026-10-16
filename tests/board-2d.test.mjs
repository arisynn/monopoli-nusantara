import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createGame} from '../lib/game.mjs';
import {BOARD} from '../lib/content.mjs';
import {tileRect,tileCenter,tokenPoint,hitTile,fitCamera,closeCamera,centerCamera,clampCamera,scaleLimits,panCamera,zoomCamera,worldPoint,resizeCamera,visibleWorld,BoardGesture} from '../lib/board-camera.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<.000001,`${a} != ${b}`);
const inBounds=c=>{const extent=1000*c.scale;for(const [p,size] of [[c.x,c.width],[c.y,c.height]])if(extent<=size-16)near(p,(size-extent)/2);else {assert(p<=8.00001);assert(p+extent>=size-8.00001)}};

test('40 classic tiles cover the exact perimeter, without overlaps; centers hit their original IDs',()=>{
 const rects=BOARD.map(t=>tileRect(t.id));let area=0;
 for(let i=0;i<40;i++){const a=rects[i];area+=a.width*a.height;assert.equal(hitTile(tileCenter(i)),i);assert(a.x>=0&&a.y>=0&&a.x+a.width<=1000&&a.y+a.height<=1000);
  for(let j=i+1;j<40;j++){const b=rects[j];assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`${i} overlaps ${j}`)}
  for(let id=0;id<6;id++){const p=tokenPoint(i,id);assert.equal(hitTile(p),i,`pawn ${id} on ${i}`)}
 }
 assert.equal(area,1000000-720*720);assert.equal(hitTile({x:500,y:500}),null);assert.equal(hitTile({x:-1,y:400}),null);
 assert.deepEqual([0,10,20,30].map(tileCenter),[{x:930,y:930},{x:70,y:930},{x:70,y:70},{x:930,y:70}]);
});
test('pan clamps all edges and centers any axis where the board fits',()=>{
 for(const [width,height] of [[304,150],[344,230],[374,354],[396,620],[684,850],[1500,400]]){
  let c=closeCamera(width,height,tileCenter(0));
  for(const dx of [-1e6,0,1e6])for(const dy of [-1e6,0,1e6])inBounds(panCamera(c,dx,dy));
  const limits=scaleLimits(width,height);inBounds(clampCamera({...c,scale:1e9}));inBounds(clampCamera({...c,scale:0}));
  assert.equal(zoomCamera(c,1e6).scale,limits.max);assert.equal(zoomCamera(c,1e-9).scale,limits.min);
 }
});
test('zoom keeps the world point beneath the pinch/wheel anchor unless clamped at an edge',()=>{
 let c=centerCamera({...fitCamera(390,500),scale:1},{x:500,y:500});const anchor={x:143,y:221},before=worldPoint(c,anchor);
 c=zoomCamera(c,1.25,anchor);const after=worldPoint(c,anchor);near(before.x,after.x);near(before.y,after.y);
 c=zoomCamera(c,.8,anchor);near(worldPoint(c,anchor).x,before.x);inBounds(c);
});
test('follow keeps all player destinations visible, including corners and backward moves',()=>{
 for(const [w,h] of [[304,150],[344,260],[374,420],[684,850]])for(let i=0;i<40;i++)for(let id=0;id<6;id++){
  const p=tokenPoint(i,id),c=closeCamera(w,h,p);inBounds(c);const r=visibleWorld(c);assert(r.x+r.width<=1000.00001&&r.y+r.height<=1000.00001);assert(p.x*c.scale+c.x>=0&&p.x*c.scale+c.x<=w);assert(p.y*c.scale+c.y>=0&&p.y*c.scale+c.y<=h);
 }
});
test('resizing preserves explored center when possible and returns a bounded minimap rectangle',()=>{
 let c=centerCamera({...fitCamera(390,500),scale:1},{x:500,y:400});c=resizeCamera(c,360,400);near(worldPoint(c,{x:180,y:200}).x,500);near(worldPoint(c,{x:180,y:200}).y,400);
 for(const size of [[300,100],[900,1100],[600,300]]){c=resizeCamera(c,...size);inBounds(c);const r=visibleWorld(c);assert(r.x>=0&&r.y>=0);assert(r.x+r.width<=1000.00001&&r.y+r.height<=1000.00001)}
});
test('tap selects, jitter stays a tap, and drag never selects or resumes follow automatically',()=>{
 const g=new BoardGesture();let c=closeCamera(390,500,tileCenter(4));g.begin(1,{x:90,y:120});c=g.move(1,{x:92,y:122},c);assert.deepEqual(g.end(1),{x:92,y:122});assert(g.following);
 g.begin(1,{x:90,y:120});c=g.move(1,{x:150,y:125},c);assert.equal(g.following,false);assert.equal(g.end(1),null);
 g.begin(2,{x:100,y:100});assert(g.end(2));assert.equal(g.following,false);g.resume();assert(g.following);inBounds(c);
});
test('pinch zooms, one remaining finger can pan, cancel and lost capture never select',()=>{
 const g=new BoardGesture();let c=centerCamera({...fitCamera(390,500),scale:1},{x:500,y:500});
 g.begin(1,{x:100,y:150});g.begin(2,{x:200,y:150});c=g.move(2,{x:250,y:150},c);near(c.scale,1.5);assert.equal(g.end(2),null);
 const old=c.x;c=g.move(1,{x:120,y:150},c);near(c.x,old+20);assert.equal(g.end(1),null);assert.equal(g.following,false);
 g.begin(3,{x:200,y:200});assert.equal(g.end(3,true),null);assert.equal(g.end(3),null);g.clear();assert.equal(g.points.size,0);
});
test('actual vector artwork exposes all tiles, ownership, hotel, mortgage and six distinct pawns',()=>{
 const require=createRequire(import.meta.url),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const source=readFileSync(new URL('../components/game/BoardMap.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const nusaModule={exports:{}};const nusaCode=ts.transpileModule(readFileSync(new URL('../components/game/NusaText.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports',nusaCode)(require,nusaModule,nusaModule.exports);
 const module={exports:{}};new Function('require','module','exports',code)(id=>id==='./NusaText'?nusaModule.exports:require(id.startsWith('@/')?'../'+id.slice(2):id),module,module.exports);
 const s=createGame({players:Array.from({length:6},(_,i)=>({name:`Pemain ${i+1}`}))});s.assets[1]={owner:0,level:5,mortgaged:false};s.assets[3]={owner:1,level:0,mortgaged:true};
 const html=renderToStaticMarkup(React.createElement('svg',null,React.createElement(module.exports.BoardArtwork,{state:s,selected:1}),React.createElement(module.exports.BoardTokens,{state:s})));
 assert.equal((html.match(/data-tile=/g)||[]).length,40);assert.equal((html.match(/data-pawn=/g)||[]).length,6);
 assert(html.includes('milik Pemain 1, hotel'));assert(html.includes('digadaikan'));assert(html.includes('GADAI'));
 assert(html.includes('/assets/tokens/'));assert(html.includes('/assets/board/chance.svg'));assert(!html.includes('<canvas'));for(const t of BOARD)assert(html.includes(t.name));
});
