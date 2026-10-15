// Board coordinates are independent of screen size. Tile 0 remains bottom-right.
export const BOARD_SIZE=1000, CORNER=140, EDGE=80, PADDING=8;
export function coords(i){if(i<=10)return [5-i,5];if(i<=20)return [-5,15-i];if(i<=30)return [i-25,-5];return [5,i-35]}
export function tileRect(id){
 if(!Number.isInteger(id)||id<0||id>39)throw new RangeError('Invalid board tile');
 if(id%10===0){const [x,y]=[[860,860],[0,860],[0,0],[860,0]][id/10];return {x,y,width:140,height:140,angle:0}}
 const side=Math.floor(id/10),n=id%10;
 if(side===0)return {x:860-n*80,y:860,width:80,height:140,angle:0};
 if(side===1)return {x:0,y:860-n*80,width:140,height:80,angle:90};
 if(side===2)return {x:60+n*80,y:0,width:80,height:140,angle:180};
 return {x:860,y:60+n*80,width:140,height:80,angle:270};
}
export function tileCenter(id){const r=tileRect(id);return {x:r.x+r.width/2,y:r.y+r.height/2}}
export function tokenPoint(tile,id){
 const r=tileRect(tile),c=tileCenter(tile),angle=r.angle*Math.PI/180;
 const x=(id%3-1)*21,y=(id<3?13:37);
 return {x:c.x+x*Math.cos(angle)-y*Math.sin(angle),y:c.y+x*Math.sin(angle)+y*Math.cos(angle)};
}
export function hitTile(point){
 for(let id=0;id<40;id++){const r=tileRect(id);if(point.x>=r.x&&point.x<r.x+r.width&&point.y>=r.y&&point.y<r.y+r.height)return id}return null;
}
export function scaleLimits(width,height){const min=Math.max(.001,(Math.min(Math.max(1,width),Math.max(1,height))-PADDING*2)/BOARD_SIZE);return {min,max:Math.max(1.6,min*4)}}
export function clampCamera(camera){
 const {min,max}=scaleLimits(camera.width,camera.height),scale=Math.max(min,Math.min(max,camera.scale));
 const extent=BOARD_SIZE*scale;
 const axis=(offset,size)=>extent<=size-PADDING*2?(size-extent)/2:Math.max(size-PADDING-extent,Math.min(PADDING,offset));
 return {...camera,scale,x:axis(camera.x,camera.width),y:axis(camera.y,camera.height)};
}
export function fitCamera(width,height){return clampCamera({width:Math.max(1,width),height:Math.max(1,height),scale:scaleLimits(width,height).min,x:0,y:0})}
export function centerCamera(camera,point){return clampCamera({...camera,x:camera.width/2-point.x*camera.scale,y:camera.height/2-point.y*camera.scale})}
export function closeCamera(width,height,point){const camera=fitCamera(width,height);return centerCamera({...camera,scale:Math.min(1.25,Math.max(.9,camera.scale*2.2))},point)}
export function worldPoint(camera,point){return {x:(point.x-camera.x)/camera.scale,y:(point.y-camera.y)/camera.scale}}
export function zoomCamera(camera,factor,anchor={x:camera.width/2,y:camera.height/2}){
 const world=worldPoint(camera,anchor),{min,max}=scaleLimits(camera.width,camera.height),scale=Math.max(min,Math.min(max,camera.scale*factor));
 return clampCamera({...camera,scale,x:anchor.x-world.x*scale,y:anchor.y-world.y*scale});
}
export function panCamera(camera,dx,dy){return clampCamera({...camera,x:camera.x+dx,y:camera.y+dy})}
export function resizeCamera(camera,width,height){const center=worldPoint(camera,{x:camera.width/2,y:camera.height/2});return centerCamera({...camera,width:Math.max(1,width),height:Math.max(1,height)},center)}
export function visibleWorld(camera){
 const x=Math.max(0,-camera.x/camera.scale),y=Math.max(0,-camera.y/camera.scale);
 return {x,y,width:Math.min(BOARD_SIZE,(camera.width-camera.x)/camera.scale)-x,height:Math.min(BOARD_SIZE,(camera.height-camera.y)/camera.scale)-y};
}

// Shared input state: a drag/pinch never becomes a tile tap; follow resumes only explicitly.
export class BoardGesture {
 constructor(){this.points=new Map();this.following=true;this.moved=false;this.origin=null;this.baseline=null}
 begin(id,point){this.points.set(id,point);if(this.points.size===1){this.origin=point;this.moved=false}if(this.points.size>1){this.moved=true;this.following=false}this.baseline=this.sample()}
 sample(){const points=[...this.points.values()];if(!points.length)return null;const a=points[0],b=points[1]||a;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)}}
 move(id,point,camera){
  if(!this.points.has(id))return camera;
  this.points.set(id,point);const next=this.sample(),previous=this.baseline;
  if(!this.moved&&Math.hypot(point.x-this.origin.x,point.y-this.origin.y)<6)return camera;
  this.moved=true;this.following=false;this.baseline=next;
  if(previous.distance>0&&next.distance>0)camera=zoomCamera(camera,next.distance/previous.distance,previous);
  return panCamera(camera,next.x-previous.x,next.y-previous.y);
 }
 end(id,cancelled=false){const point=this.points.get(id);if(!point)return null;const tap=!cancelled&&!this.moved&&this.points.size===1?point:null;this.points.delete(id);this.baseline=this.sample();if(cancelled)this.moved=true;return tap}
 explore(){this.following=false}
 resume(){this.following=true}
 clear(){this.points.clear();this.baseline=null;this.moved=true}
}
