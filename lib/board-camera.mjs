// Fixed board geometry. UI zoom never changes tile order or board orientation.
export function coords(i){if(i<=10)return [5-i,5];if(i<=20)return [-5,15-i];if(i<=30)return [i-25,-5];return [5,i-35]}
export const CAMERA={overview:[0,19,12],top:[0,25,.01]};
export function boardFrustum(width,height,view='overview'){
 const aspect=Math.max(1,width)/Math.max(1,height),[,y,z]=view==='top'?CAMERA.top:CAMERA.overview;
 const length=Math.hypot(y,z),vertical=6.1*y/length+1.3*z/length;
 const halfHeight=Math.max(vertical,6.1/aspect)*1.045;
 return {left:-halfHeight*aspect,right:halfHeight*aspect,top:halfHeight,bottom:-halfHeight};
}
