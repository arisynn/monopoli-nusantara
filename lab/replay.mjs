import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { createGame,command } from '../engine/index.mjs';
import { recordBotMemory } from '../models/index.mjs';
const dir=process.argv[2];if(!dir)throw Error('Usage: node lab/replay.mjs runs/RUN_ID/matches/match-0001');
const read=async f=>JSON.parse(await readFile(path.join(dir,f),'utf8'));
const cfg=await read('summary.json'),initial=await read('initial-state.json'),final=await read('final-state.json');
let seed=cfg.seed>>>0;const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let s=createGame({players:initial.players.map(p=>({name:p.name,controller:p.controller,botPersona:p.botPersona,botDifficulty:p.botDifficulty})),startingRoll:false,advisorEnabled:false,matchId:initial.matchId},rng);
if(hash(s)!==hash(initial))throw Error('Initial state mismatch. Cannot replay this version.');
const lines=(await readFile(path.join(dir,'actions.jsonl'),'utf8')).trim().split('\n').filter(Boolean);
for(const raw of lines){const e=JSON.parse(raw);const h=hash(s);if(h!==e.stateHashBefore)throw Error(`Before hash mismatch at step ${e.step}`);
 const before=s;const next=command(before,e.actor,{...e.action,id:`bench:${initial.matchId}:${e.step}`,expectedVersion:before.version},rng);recordBotMemory(next,before,e.actor,e.action);
 if(hash(next)!==e.stateHashAfter)throw Error(`After hash mismatch at step ${e.step}`);s=next;
}
if(hash(s)!==hash(final))throw Error('Final state mismatch');
console.log(JSON.stringify({replay:'PASS',matchId:initial.matchId,steps:lines.length,version:s.version,phase:s.phase,hash:hash(s)}));
