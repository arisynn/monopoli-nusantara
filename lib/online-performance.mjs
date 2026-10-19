// Local, bounded diagnostics. No tokens, names, action bodies or database upload.
export const percentile=(values,q)=>values.length?values.toSorted((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(q*values.length)-1)]:null;
export class OnlinePerformance {
 constructor({now=()=>performance.now(),limit=512}={}){this.now=now;this.limit=limit;this.samples=[];}
 record(stage,ms,detail={}){if(!Number.isFinite(ms)||ms<0)return;const row={stage,ms,at:this.now()};for(const key of ['trace','version','depth','versions','mode','count','kind'])if(['string','number'].includes(typeof detail[key]))row[key]=detail[key];this.samples.push(row);if(this.samples.length>this.limit)this.samples.splice(0,this.samples.length-this.limit);return row;}
 summary(){return Object.fromEntries([...new Set(this.samples.map(s=>s.stage))].map(stage=>{const v=this.samples.filter(s=>s.stage===stage).map(s=>s.ms);return[stage,{count:v.length,p50:percentile(v,.5),p95:percentile(v,.95),max:Math.max(...v)}];}));}
 export(){return {clock:'local monotonic milliseconds; cross-device clocks are not subtracted',summary:this.summary(),samples:this.samples.slice()};}
}
