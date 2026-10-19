export function requestPerformance(){
 const started=performance.now(),receivedAt=Date.now(),trace=crypto.randomUUID(),spans={};
 return {trace,receivedAt,spans,
  async measure(name,fn){const t=performance.now();try{return await fn();}finally{spans[name]=(spans[name]||0)+performance.now()-t;}},
  wrap(store){return new Proxy(store,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{const t=performance.now();try{return await value.apply(target,args);}finally{spans[String(key)]=(spans[String(key)]||0)+performance.now()-t;}};}});},
  response(value,status=200){const total=performance.now()-started;const timing={trace,receivedAt,sentAt:Date.now(),totalMs:total,spans};return Response.json({...value,_performance:timing},{status,headers:{'Cache-Control':'no-store',Vary:'Authorization','Server-Timing':[`app;dur=${total.toFixed(2)}`,...Object.entries(spans).map(([k,v])=>`${k};dur=${v.toFixed(2)}`)].join(', ')}});}
 };
}
