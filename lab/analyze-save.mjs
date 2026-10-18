import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const file=process.argv[2]||'fixtures/nusa-loop-mortgage-redeem.json';
const data=JSON.parse(await readFile(file,'utf8'));
const state=data.state||data;
if(!Array.isArray(state.log))throw Error('Input must contain a game state with log[]');
const events=[...state.log].sort((a,b)=>a.id-b.id);
const histogram=new Map(),series=[],alerts=[];
let last=null,streak=0,first=null;
for(const e of events){
 const fm=e.finance?.find(x=>x.kind==='mortgage'||x.kind==='redeem');
 const key=fm?`${e.actor}|${fm.tile}|${e.turn}`:null;
 if(key&&last?.key===key&&last?.kind!==fm.kind){streak++;if(streak===1)first=last.eventId;}
 else{streak=0;first=e.id;}
 if(fm){const k=`${e.actor}/${fm.tile}/${fm.kind}`;histogram.set(k,(histogram.get(k)||0)+1);}
 if(key&&streak>=5&&streak%2===1){alerts.push({kind:'mortgage_redeem_oscillation',actor:e.actor,tile:fm.tile,round:e.turn,firstEventId:first,lastEventId:e.id,alternatingActions:streak+1});}
 series.push({eventId:e.id,version:e.version,actor:e.actor,type:e.type,text:e.text,finance:e.finance||null,assetChanges:e.assetChanges||null});
 last={key,kind:fm?.kind,eventId:e.id};
}
const report={input:path.basename(file),matchId:state.matchId,sourceVersion:state.version,phase:state.phase,round:state.round,events:events.length,counts:Object.fromEntries(histogram),loopAlerts:alerts,totalLoops:alerts.length};
await mkdir('runs/save-analysis',{recursive:true});
const filename=path.join('runs/save-analysis',path.basename(file).replace(/\.json$/,'')+'-report.json');
await writeFile(filename,JSON.stringify({report,events:series},null,2)+'\n');
console.log(JSON.stringify({...report,loopAlerts:report.loopAlerts.slice(0,5),remainingLoopAlerts:Math.max(0,report.loopAlerts.length-5)},null,2));
console.log('ANALISIS: '+path.resolve(filename));
