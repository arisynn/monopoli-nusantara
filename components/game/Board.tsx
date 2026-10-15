'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {BOARD,PAWNS} from '@/lib/content.mjs';
import {coords,boardFrustum,CAMERA} from '@/lib/board-camera.mjs';
import {GRAPHICS} from '@/lib/preferences.mjs';
export {coords} from '@/lib/board-camera.mjs';
const offset=(id:number)=>({x:(id%3-1)*.24,z:id>=3?.17:-.17});
const symbols:any={start:'↖',chance:'?',community:'✦',tax:'◇',station:'▰',utility:'⌁',jail:'▥',parking:'P',gojail:'→'};
export default function Board({state,selected,onSelect,view='overview',cameraKey=0,reduced=false,speed=false,quality='balanced'}:{state:any,selected:number,onSelect:(n:number)=>void,view?:string,cameraKey?:number,reduced?:boolean,speed?:boolean,quality?:string}){
 const host=useRef<HTMLDivElement>(null),engine=useRef<any>(null),props=useRef({state,selected,onSelect,view,cameraKey,reduced,speed});props.current={state,selected,onSelect,view,cameraKey,reduced,speed};const [fallback,setFallback]=useState(false);
 useEffect(()=>{setFallback(false)},[quality]);
 useEffect(()=>{if(!host.current||quality==='flat'||fallback)return;const graphics=GRAPHICS[quality as keyof typeof GRAPHICS]||GRAPHICS.balanced;let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({antialias:graphics.antialias,alpha:true,powerPreference:'low-power'})}catch{setFallback(true);return}const root=host.current;renderer.setPixelRatio(Math.min(window.devicePixelRatio,graphics.pixelRatio));renderer.shadowMap.enabled=graphics.shadows;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0x000000,0);root.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,150);camera.position.set(...CAMERA.overview as [number,number,number]);const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.1;controls.minZoom=.7;controls.maxZoom=2.8;controls.maxPolarAngle=Math.PI/2.35;controls.minPolarAngle=.04;controls.enableRotate=false;controls.target.set(0,0,0);controls.update();
 scene.add(new THREE.HemisphereLight(0xf4f3ff,0x394d69,2.3));const sun=new THREE.DirectionalLight(0xfff0d6,3.1);sun.position.set(-9,18,10);sun.castShadow=graphics.shadows;sun.shadow.mapSize.set(quality==='high'?1024:512,quality==='high'?1024:512);Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,far:50});sun.shadow.normalBias=.05;scene.add(sun);const fill=new THREE.DirectionalLight(0x7dafff,1.4);fill.position.set(5,5,-8);scene.add(fill);
 const materials=new Map<string,THREE.MeshStandardMaterial>();const mat=(c:string)=>{if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.76,metalness:.08}));return materials.get(c)!};
 function box(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function cone(parent:THREE.Object3D,x:number,y:number,z:number,r:number,h:number,color:string,sides=4){let m=new THREE.Mesh(new THREE.ConeGeometry(r,h,sides),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m}
 function sphere(parent:THREE.Object3D,x:number,y:number,z:number,r:number,color:string){let m=new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),mat(color));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m}
 box(scene,0,-.36,0,11.8,.55,11.8,'#14283b');box(scene,0,-.05,0,11.65,.12,11.65,'#bd9d61');box(scene,0,.06,0,11.5,.13,11.5,'#2c414d');box(scene,0,.15,0,8.9,.12,8.9,'#243c46');
 const tiles:THREE.Object3D[]=[],owners:THREE.Mesh[]=[],houses=new THREE.Group();scene.add(houses);
 for(const t of BOARD){const [x,z]=coords(t.id);const mesh=box(scene,x,.19,z,.965,.17,.965,t.id%10===0?'#d3c5a3':'#e4ddc9');mesh.userData.tile=t.id;tiles.push(mesh);
 if(t.type==='city'){box(scene,x,.283,z-.37,.965,.025,.2,t.color)}
 const cv=document.createElement('canvas');cv.width=256;cv.height=256;const cx=cv.getContext('2d')!;cx.clearRect(0,0,256,256);cx.textAlign='center';cx.fillStyle='#1c3140';cx.font='bold 25px Arial';const words=t.name.toUpperCase().split(' ');words.forEach((word:string,i:number)=>cx.fillText(word,128,112+i*29,238));if(t.price){cx.font='21px Arial';cx.fillStyle='#51616b';cx.fillText((t.price/1000).toLocaleString('id-ID')+'k',128,223)}else{cx.font='bold 65px Georgia';cx.fillStyle=t.color;cx.fillText(symbols[t.type]||'◇',128,220)}
 const texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(new THREE.PlaneGeometry(.91,.91),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));label.rotation.x=-Math.PI/2;label.position.set(x,.292,z);scene.add(label);
 let owner=box(scene,x,.3,z+.41,.75,.04,.065,'#d6cdb6');owners[t.id]=owner;
 }
 const centerCanvas=document.createElement('canvas');centerCanvas.width=1024;centerCanvas.height=1024;const ctx=centerCanvas.getContext('2d')!;ctx.fillStyle='#d8bd7d';ctx.textAlign='center';ctx.font='28px Arial';ctx.letterSpacing='8px';ctx.fillText('JELAJAHI · MILIKI · MENANGKAN',512,730);ctx.font='bold 110px Georgia';ctx.letterSpacing='0px';ctx.fillText('NUSANTARA',512,850);ctx.font='24px Arial';ctx.letterSpacing='8px';ctx.fillStyle='#93aaa8';ctx.fillText('SEBUAH PERJALANAN PROPERTI',512,910);const tex=new THREE.CanvasTexture(centerCanvas);tex.colorSpace=THREE.SRGBColorSpace;const centerLabel=new THREE.Mesh(new THREE.PlaneGeometry(8.3,8.3),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));centerLabel.rotation.x=-Math.PI/2;centerLabel.position.y=.226;scene.add(centerLabel);
 // Generated artwork is a texture on the physical board, separate from rules and labels.
 const refreshTextures=()=>{scene.traverse((o:any)=>{if(o.material?.map)o.material.map.needsUpdate=true});invalidate()};
 const imageLoader=new THREE.TextureLoader();
 const panorama=imageLoader.load('/assets/nusantara-scene.webp',refreshTextures);panorama.colorSpace=THREE.SRGBColorSpace;
 const artwork=new THREE.Mesh(new THREE.PlaneGeometry(8.55,5.7),new THREE.MeshBasicMaterial({map:panorama}));artwork.rotation.x=-Math.PI/2;artwork.position.set(0,.23,-1);scene.add(artwork);
 const deck=(x:number,z:number,c:string)=>{let g=new THREE.Group();for(let i=0;i<4;i++)box(g,0,.25+i*.025,0,.85,.025,1.15,i===3?c:'#dfd3b4');g.rotation.y=-.18;g.position.set(x,0,z);scene.add(g)};deck(-2.5,2.2,'#bf9c64');deck(2.5,2.2,'#719f97');
 const deckAtlas=imageLoader.load('/assets/card-atlas.webp',refreshTextures);deckAtlas.colorSpace=THREE.SRGBColorSpace;
 for(let i=0;i<2;i++){const texture=deckAtlas.clone();texture.repeat.set(.5,1);texture.offset.set(i*.5,0);texture.needsUpdate=true;const art=new THREE.Mesh(new THREE.PlaneGeometry(.82,1.12),new THREE.MeshBasicMaterial({map:texture}));art.rotation.x=-Math.PI/2;art.rotation.z=.18;art.position.set(i===0?-2.5:2.5,.34,2.2);scene.add(art)}
 const tokenAtlas=imageLoader.load('/assets/pawn-atlas.webp',refreshTextures);tokenAtlas.colorSpace=THREE.SRGBColorSpace;
 const tokenGroups:THREE.Group[]=[];
 for(let id=0;id<6;id++){
  const g=new THREE.Group(),color=PAWNS[id].color;scene.add(g);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.19,.22,.06,20),mat(color));base.position.y=.34;g.add(base);
  const variant=id%4,texture=tokenAtlas.clone();texture.repeat.set(.5,.5);texture.offset.set(variant%2*.5,variant>1?0:.5);texture.needsUpdate=true;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,alphaTest:.06,depthWrite:false,color:id>=4?color:'#ffffff'}));sprite.scale.set(.7,.53,1);sprite.position.set(0,.63,0);g.add(sprite);tokenGroups.push(g);
 }
 const ring=new THREE.Mesh(new THREE.RingGeometry(.43,.49,40),new THREE.MeshBasicMaterial({color:'#e8bc69',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.306;scene.add(ring);
 let raf=0,frames=0,rendering=false,disposed=false,moveKey='',movement:any=null,manual=false,lastCameraKey=-1,orientation='overview';let manualTimer:ReturnType<typeof setTimeout>;const desired=new THREE.Vector3(),delta=new THREE.Vector3();controls.addEventListener('start',()=>{manual=true;clearTimeout(manualTimer)});controls.addEventListener('end',()=>{if(props.current.view==='follow')manualTimer=setTimeout(()=>{manual=false;invalidate()},4500)});const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down={x:0,y:0};
 function render(){raf=0;if(disposed||document.hidden)return;rendering=true;controls.update();if(movement){const elapsed=performance.now()-movement.start,step=props.current.speed?60:140,idx=Math.floor(elapsed/step);if(idx>=movement.path.length){const [x,z]=coords(movement.path.at(-1));tokenGroups[movement.player].position.set(x+movement.ox,0,z+movement.oz);movement=null}else{const [x,z]=coords(movement.path[idx]);const g=tokenGroups[movement.player];g.position.lerp(new THREE.Vector3(x+movement.ox,Math.sin(elapsed/step*Math.PI)*.09,z+movement.oz),.38);frames=3}}
 if(!manual&&props.current.view==='follow'){const active=tokenGroups[props.current.state?.turn||0];desired.set(active.position.x*.55,0,active.position.z*.55);delta.copy(desired).sub(controls.target).multiplyScalar(props.current.reduced?1:.16);if(delta.length()>.001){controls.target.add(delta);camera.position.add(delta);controls.update();frames=Math.max(frames,2)}}
 renderer.render(scene,camera);rendering=false;if(--frames>0||movement)raf=requestAnimationFrame(render)}
 function invalidate(){frames=12;if(!raf&&!document.hidden&&!disposed)raf=requestAnimationFrame(render)}
 controls.addEventListener('change',()=>{if(!raf&&!rendering&&!document.hidden&&!disposed){frames=2;raf=requestAnimationFrame(render)}});
 function resize(){const w=Math.max(1,root.clientWidth),h=Math.max(1,root.clientHeight);renderer.setSize(w,h);Object.assign(camera,boardFrustum(w,h,orientation));camera.updateProjectionMatrix();invalidate()}
 const observer=new ResizeObserver(resize);observer.observe(root);
 const start=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};invalidate()};const up=(e:PointerEvent)=>{if(Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));ray.setFromCamera(pointer,camera);let hits=ray.intersectObjects(tiles);if(hits.length)props.current.onSelect(hits[0].object.userData.tile)};
 renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',up);
 engine.current={update(){const {state:s,selected:n,view:v,reduced}=props.current;ring.position.x=coords(n)[0];ring.position.z=coords(n)[1];
 while(houses.children.length){const obj=houses.children[0] as THREE.Mesh;houses.remove(obj);obj.geometry.dispose()}
 for(const tile of BOARD){const a=s?.assets[tile.id];owners[tile.id].material=mat(a?.owner!=null?PAWNS[a.owner].color:'#d6cdb6');if(a?.mortgaged)owners[tile.id].material=mat('#7b6e88');if(a?.level){const [x,z]=coords(tile.id);if(a.level===5)box(houses,x,.48,z-.23,.36,.37,.25,'#cc765e');else for(let i=0;i<a.level;i++)box(houses,x-.27+i*.18,.4,z-.24,.13,.19,.14,'#55866b')}}
 tokenGroups.forEach((g,i)=>{let p=s?.players[i];g.visible=!!p&&!p.out;if(p){let [x,z]=coords(p.pos);g.position.set(x+offset(i).x,0,z+offset(i).z)}});
 if(s?.lastMove&&moveKey!==`${s.matchId}:${s.lastMove.id}`){moveKey=`${s.matchId}:${s.lastMove.id}`;if(!reduced&&!s.lastMove.jump&&s.lastMove.path.length>1){const id=s.lastMove.player;movement={...s.lastMove,start:performance.now(),ox:offset(id).x,oz:offset(id).z};const [fx,fz]=coords(s.lastMove.from??s.lastMove.path[0]);tokenGroups[id].position.set(fx+movement.ox,0,fz+movement.oz)}}
 controls.enabled=v!=='locked';controls.enableDamping=!reduced;if(reduced)movement=null;
 if(lastCameraKey!==props.current.cameraKey){manual=false;clearTimeout(manualTimer);lastCameraKey=props.current.cameraKey}
 if(!manual&&v!=='locked'){
  orientation=v==='top'?'top':'overview';const [cx,cy,cz]=orientation==='top'?CAMERA.top:CAMERA.overview;
  let x=0,z=0;if(v==='focus')[x,z]=coords(n);else if(v==='follow')[x,z]=coords(s?.players[s.turn]?.pos||0);
  controls.target.set(x*.55,0,z*.55);camera.position.set(cx+x*.55,cy,cz+z*.55);camera.zoom=v==='follow'||v==='focus'?1.5:1;controls.update();resize();
 }
 camera.updateProjectionMatrix();invalidate();},dispose(){}};engine.current.update();resize();
 const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else invalidate()};const lost=(event:Event)=>{event.preventDefault();setFallback(true)};document.addEventListener('visibilitychange',visibility);renderer.domElement.addEventListener('webglcontextlost',lost);
 return()=>{disposed=true;clearTimeout(manualTimer);document.removeEventListener('visibilitychange',visibility);renderer.domElement.removeEventListener('webglcontextlost',lost);cancelAnimationFrame(raf);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',up);scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();if(m.material){const arr=Array.isArray(m.material)?m.material:[m.material];for(let mat of arr){(mat as any).map?.dispose();mat.dispose()}}});renderer.dispose();renderer.domElement.remove();engine.current=null};
 },[quality,fallback]);
 useEffect(()=>engine.current?.update(),[state,selected,view,cameraKey,reduced,speed]);
 return <div className="board-renderer" ref={host} aria-label="Papan Monopoli Nusantara 2.5D, 40 petak. Pilih kota atau gunakan daftar aset.">{(fallback||quality==='flat')&&<div className="flat-board">{BOARD.map(t=>{let [x,z]=coords(t.id);return <button aria-label={`${t.name}${state?.players.filter((p:any)=>p.pos===t.id&&!p.out).map((p:any)=>`, ${p.name}`).join('')||''}`} style={{gridColumn:x+6,gridRow:z+6,borderTopColor:t.color}} key={t.id} onClick={()=>onSelect(t.id)}>{t.name}<b>{state?.players.filter((p:any)=>p.pos===t.id&&!p.out).map((p:any)=>PAWNS[p.id].symbol).join(' ')}</b></button>})}<div className="flat-center">MONOPOLI<br/><strong>Nusantara</strong><small>Tampilan 2D</small></div></div>}</div>
}
