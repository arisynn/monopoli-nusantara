import {performance} from 'node:perf_hooks';import {writeFileSync} from 'node:fs';
import {createGame,command} from '../lib/game.mjs';
import {MODELS,decideMind,seeded} from '../lib/bot/mind.mjs';
import {localPlayers} from '../lib/bot/personas.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('='))),repeats=Number(args.repeats||15);
function scenario(kind){
 let s=createGame({players:localPlayers('Human',4),startingRoll:false,matchId:'profile'},seeded(7));s.turn=1;
 if(kind==='auction'){s.phase='buy';s.buy=19;s=command(s,1,{type:'AUCTION'});}
 if(kind==='build'){s.phase='end';for(const i of [16,18,19])s.assets[i].owner=1;s.players[1].cash=6000;}
 if(kind==='debt'){s.phase='debt';s.debt={from:1,to:null,amount:4000,label:'profil'};s.players[1].cash=500;for(const i of [1,3,5,12,16,18,19])s.assets[i].owner=1;}
 if(kind==='trade'){s.phase='end';s.assets[16].owner=0;s.assets[18].owner=1;s.assets[19].owner=1;s=command(s,0,{type:'OFFER',trade:{to:1,give:[16],take:[],giveCash:0,takeCash:6000,giveCards:0,takeCards:0}});}
 return s;
}
const rows=[],selection=[];
for(const kind of ['roll','auction','build','debt','trade'])for(const model of MODELS){
 const s=scenario(kind),runs=[];
 for(let i=0;i<repeats;i++){const start=performance.now(),p=decideMind(s,1,{difficulty:model.id,seed:4600+i});runs.push({ms:performance.now()-start,nodes:p.diagnostics.nodes,samples:p.diagnostics.samples,action:p.action});command(s,1,p.action,seeded(i));}
 const sorted=runs.map(r=>r.ms).sort((a,b)=>a-b);rows.push({kind,model:model.id,repeats,p50:sorted[Math.floor(repeats*.5)],p95:sorted[Math.min(repeats-1,Math.floor(repeats*.95))],max:sorted.at(-1),meanNodes:runs.reduce((n,r)=>n+r.nodes,0)/repeats,searchSamples:runs.reduce((n,r)=>n+r.samples,0)});
}
// Candidate algorithms are compared on identical public states/seeds and hard node limits.
for(const variant of ['tactical','short','full'])for(const kind of ['auction','build','trade']){
 const s=scenario(kind),runs=[];
 for(let i=0;i<repeats;i++){const p=decideMind(s,1,{difficulty:variant==='tactical'?'hard':'hardcore',searchVariant:variant==='short'?'short':'full',seed:i,maxNodes:160,clock:()=>0});runs.push(p.diagnostics);}
 selection.push({variant,kind,meanNodes:runs.reduce((n,r)=>n+r.nodes,0)/repeats,completedSamples:runs.reduce((n,r)=>n+r.samples,0),selectedBy:[...new Set(runs.map(r=>r.selectedBy))]});
}
const report={generatedAt:new Date().toISOString(),node:process.version,resources:process.resourceUsage(),repeats,rows,selection,notes:['Cloud CPU only; no Android FPS claim.','Model selection here measures operational cost and sample completion; superiority needs full games.','Deterministic node-budget selection tests use a frozen clock, not claimed wall latency.']};
writeFileSync('docs/MIND_PROFILE.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
