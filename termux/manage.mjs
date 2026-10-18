import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve} from 'node:path';
import {loadConfig,saveConfig,initData,DATA} from './config.mjs';
import {WorkerClient} from './client.mjs';
import {MODEL_MANIFEST_ID,MODEL_FILES,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';
import {createHash} from 'node:crypto';
import {ROOT} from './config.mjs';

async function promptAll(task){
 let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});
 const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
 const ask=async(question,secret=false)=>{process.stdout.write(question);muted=secret;const answer=await rl.question('');muted=false;if(secret)process.stdout.write('\n');return answer.trim();};
 try{return await task(ask);}finally{rl.close();}
}
async function jsonRequest(url,body,token){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(18000)});
 const data=await r.json();if(!r.ok)throw Error(data.error||data.message||'Permintaan ditolak.');return data;
}
async function setup(){
 await promptAll(async ask=>{
  const api=(await ask('Origin situs game (https://…): ')).replace(/\/$/,'');
  const u=new URL(api);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Gunakan HTTPS.');
  if(u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('Gunakan origin situs tanpa path.');
  const publicConfig=await (await fetch(`${api}/api/online?config`,{signal:AbortSignal.timeout(12000)})).json();
  if(!publicConfig.online)throw Error('Supabase backend belum siap.');
  const protocol=await (await fetch(`${api}/api/worker`,{signal:AbortSignal.timeout(12000)})).json();
  if(protocol.protocol!==WORKER_PROTOCOL||protocol.manifest!==MODEL_MANIFEST_ID)throw Error('Versi backend berbeda; deploy backend dari ZIP yang sama.');
  const mode=await ask('Identitas perangkat: 1=tamu baru, 2=login akun (default 1): ');
  let session;
  if(mode==='2'){
   const email=await ask('Email: '),password=await ask('Password: ',true);
   session=await jsonRequest(`${api}/api/auth?op=login`,{email,password});
  }else session=await jsonRequest(`${api}/api/auth?op=guest`,{data:{}});
  if(!session.access_token)throw Error('Sesi perangkat tidak tersedia. Aktifkan anonymous sign-in atau pilih login akun.');
  const pairingCode=await ask('Kode pairing sekali pakai dari operator: ',true);
  const label=(await ask('Nama perangkat (default Termux): '))||'Termux';
  const result=await jsonRequest(`${api}/api/worker`,{op:'pair',pairingCode,label,manifest:MODEL_MANIFEST_ID,protocol:WORKER_PROTOCOL},session.access_token);
  await saveConfig({api,token:result.token,workerId:result.workerId,supabaseUrl:publicConfig.url,publicKey:publicConfig.key,slots:1,budget:2600,advisor:false,
   session:{access_token:session.access_token,refresh_token:session.refresh_token,expires_at:Date.now()/1000+session.expires_in}});
  console.log('Pairing berhasil. Credential disimpan privat; tidak ada service-role key di perangkat.');
 });
}
function render(s){
 const clean=x=>String(x??'—').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').slice(0,120);
 const events=(s.events||[]).slice(-5);
 const lines=['NUSA ONLINE — TERMUX WORKER',`Koneksi: ${clean(s.connection)} | Realtime: ${s.realtime?'aktif':'recovery polling'}`,
  `Model: ${clean(s.model)} | Slot: ${(s.active||[]).length}/${s.slots||0} | RAM: ${s.memoryMb||0} MB`,
  `Commit: ${s.committed||0} | Retry: ${s.retries||0} | Stale: ${s.stale||0}`,
  `Request: ${s.network?.requests||0} | Payload RX: ${Math.round((s.network?.receivedBytes||0)/1024)} KiB | RTT terakhir: ${s.network?.lastRttMs||0} ms`,
  `Heartbeat: ${clean(s.heartbeatAt)} | Update: ${clean(s.updatedAt)}`,'',
  'ROOM AKTIF',...(s.rooms||[]).slice(0,8).map(r=>`${clean(r.code)} | ${clean(r.phase)} | actor ${r.actor??'manusia'} | v${r.sourceVersion}`),
  '', 'LIMA EVENT TERBARU',...events.map(e=>`${clean(e.at?.slice(11,19))} ${clean(e.text)}`),'','Ctrl+C menutup monitor; worker PM2 tetap berjalan.'];
 return lines.join('\n');
}
async function monitor(){
 let closed=false;const stop=()=>{closed=true;};process.once('SIGINT',stop);if(process.stdout.isTTY)process.stdout.write('\x1b[?25l');
 try{while(!closed){let s;try{s=JSON.parse(await readFile(resolve(DATA,'status.json'),'utf8'));}catch{s={connection:'belum berjalan'};}
  if(process.stdout.isTTY)process.stdout.write('\x1b[H\x1b[2J'+render(s)+'\n');else console.log(`${new Date().toISOString()} ${s.connection} commit=${s.committed||0} active=${s.active?.length||0}`);
  await new Promise(r=>setTimeout(r,process.stdout.isTTY?1000:10000));}}
 finally{process.removeListener('SIGINT',stop);if(process.stdout.isTTY)process.stdout.write('\x1b[?25h\n');}
}
async function verify(){
 for(const [file,expected] of Object.entries(MODEL_FILES)){
  const actual=createHash('sha256').update(await readFile(resolve(ROOT,file))).digest('hex');
  if(actual!==expected)throw Error(`Checksum model berbeda: ${file}`);
 }
 console.log(`Model/engine checksum OK: ${Object.keys(MODEL_FILES).length} file; ${MODEL_MANIFEST_ID}`);
}
async function main(){
 await initData();const operation=process.argv[2];
 if(operation==='setup')return setup();
 if(operation==='verify')return verify();
 if(operation==='monitor')return monitor();
 if(operation==='logs'){
  const log=createReadStream(resolve(DATA,'logs/worker.jsonl'));for await(const chunk of log)process.stdout.write(chunk);return;
 }
 const config=await loadConfig(),client=new WorkerClient(config);
 if(operation==='validate'){console.log('Konfigurasi worker tersedia.');return;}
 if(operation==='check'){await verify();await client.request('heartbeat',{slots:config.slots});const s=await client.request('status');console.log(`Koneksi OK. Provider: ${s.provider}. Slot: ${s.slots}/${s.maxSlots}. Room aktif: ${s.rooms.length}.`);return;}
 if(operation==='status'){const s=await client.request('status');console.log(JSON.stringify(s,null,2));return;}
 if(operation==='settings')return promptAll(async ask=>{
  const info=await client.request('status');const slots=Number(await ask(`Slot komputasi 1–${info.maxSlots} (sekarang ${config.slots}): `))||config.slots;
  if(!Number.isInteger(slots)||slots<1||slots>info.maxSlots)throw Error('Slot di luar izin perangkat.');
  const budget=Number(await ask(`Budget eksplisit 64–2600 ms (sekarang ${config.budget}): `))||config.budget;
  if(!Number.isInteger(budget)||budget<64||budget>2600)throw Error('Budget tidak valid.');
  const advisor=(await ask('Advisor Groq opsional? y/N: ')).toLowerCase()==='y';
  await saveConfig({...config,slots,budget,advisor});console.log('Tersimpan. Restart worker untuk menerapkan.');
 });
 throw Error('Pilih setup/check/status/monitor/logs/settings/verify.');
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename))main().catch(error=>{console.error(error.message);process.exitCode=1;});
export {render};
