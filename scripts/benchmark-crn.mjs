import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createGame,command,chooseBot} from '../lib/game.mjs';
import {sampleWorld,seeded,simulationActor,positionValue} from '../lib/bot/mind.mjs';
import {ScenarioRandom} from '../lib/bot/scenario-random.mjs';
import {mindProvenance} from './mind-provenance.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const batches=Number(args.batches||8),draws=Number(args.draws||8),output=args.output||'docs/MIND_CRN_PROBE.json';
if(!Number.isSafeInteger(batches)||batches<2||batches>1000||!Number.isSafeInteger(draws)||draws<2||draws>1000)throw Error('Invalid bounded CRN probe');
const state=createGame({players:Array.from({length:4},(_,id)=>({name:'P'+id,controller:'bot'})),startingRoll:false,matchId:'crn-probe'},seeded(1));
state.players[0].pos=10;state.players[0].inJail=true;state.phase='jail';for(const t of [16,18,19])Object.assign(state.assets[t],{owner:1,level:3});
const actions=[{type:'JAIL_PAY'},{type:'ROLL'}],groups={sequential:[],decomposed:[]};
function outcome(root,seed,kind){
 const random=new ScenarioRandom(seed),rng=seeded(seed),world=sampleWorld(state,kind==='decomposed'?random.stream(0,0,'sampled-decks'):rng);let s=world;
 const apply=(s,id,a)=>{const next=command(s,id,a,kind==='decomposed'?random.forAction(s,id,a):rng);if(next.log.length>80)next.log=next.log.slice(0,80);return next;};
 s=apply(s,0,root);
 for(let i=0;i<48&&s.phase!=='won'&&s.turnSerial<4;i++){const id=simulationActor(s),a=chooseBot(s,id);if(!a)break;s=apply(s,id,a);}
 return positionValue(s,0);
}
for(let b=0;b<batches;b++)for(const kind of Object.keys(groups)){
 let delta=0;for(let j=0;j<draws;j++){const seed=(0x24000000+b*65537+j*997)>>>0;delta+=outcome(actions[0],seed,kind)-outcome(actions[1],seed,kind);}groups[kind].push(delta/draws);
}
const variance=xs=>{const mean=xs.reduce((a,b)=>a+b,0)/xs.length;return xs.reduce((n,v)=>n+(v-mean)**2,0)/(xs.length-1);};
const sequentialVariance=variance(groups.sequential),decomposedVariance=variance(groups.decomposed),report={generatedAt:new Date().toISOString(),sourceHash:mindProvenance().sourceHash,batches,draws,actions,groups,sequentialVariance,decomposedVariance,varianceReduction:sequentialVariance>0?1-decomposedVariance/sequentialVariance:null,limitations:['Single public jail-choice fixture with bounded cheap continuation; not the full policy benchmark.','Small probe reports observed variance only, not a universal or statistically established reduction.','Authoritative game RNG and source are never modified.','Use many diverse positions/batches before accepting a general variance or win-rate claim.']};
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,sequentialVariance,decomposedVariance,varianceReduction:report.varianceReduction}));
