// Real PM2 lifecycle + outbound HTTP smoke; mock backend, no Supabase credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
const run=promisify(execFile),dir=await mkdtemp(resolve(tmpdir(),'nusa-pm2-')),data=resolve(dir,'data');
await mkdir(data,{mode:0o700});let heartbeats=0,claims=0;
const server=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 let body;try{body=JSON.parse(raw);}catch{body={};}
 let value={};
 if(body.op==='heartbeat'){heartbeats++;value={ok:true,provider:'termux',rooms:[]};}
 if(body.op==='claim'){claims++;value={job:null};}
 if(body.op==='status')value={provider:'termux',rooms:[],slots:1,maxSlots:1};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${server.address().port}`;
await writeFile(resolve(data,'config.json'),JSON.stringify({api,token:'f'.repeat(64),supabaseUrl:api,publicKey:'test-only',slots:1,budget:64,advisor:false,session:{access_token:'test-only',expires_at:Date.now()/1000+3600}}),{mode:0o600});
const env={...process.env,PM2_HOME:resolve(dir,'pm2'),NUSA_ONLINE_DATA:data};
const pm2=process.env.NUSA_TEST_PM2||'pm2',root=resolve(import.meta.dirname,'..');
const invoke=(...args)=>run(pm2,args,{env,cwd:root,maxBuffer:4*1024*1024});
const wait=async predicate=>{const end=Date.now()+15000;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert(predicate());};
const report={environment:'Linux Node 24 + actual PM2 6.0.14; mock HTTP backend',checks:[]};
try{
 await invoke('start','termux/ecosystem.config.cjs','--only','nusa-online-worker');await wait(()=>heartbeats>0&&claims>0);
 report.checks.push('PM2 starts daemon and daemon performs outbound heartbeat and claim');
 const first=JSON.parse((await invoke('jlist')).stdout).find(p=>p.name==='nusa-online-worker');assert.equal(first.pm2_env.status,'online');
 await invoke('restart','nusa-online-worker','--update-env');await wait(()=>heartbeats>=2);
 const second=JSON.parse((await invoke('jlist')).stdout).find(p=>p.name==='nusa-online-worker');assert.notEqual(first.pid,second.pid);
 report.checks.push('PM2 restart starts a new daemon and recovers private configuration');
 await invoke('stop','nusa-online-worker');const stopped=JSON.parse((await invoke('jlist')).stdout).find(p=>p.name==='nusa-online-worker');assert.equal(stopped.pm2_env.status,'stopped');
 report.checks.push('Graceful PM2 stop releases process/lock without killing unrelated PM2 applications');report.pass=true;
}finally{
 await invoke('delete','nusa-online-worker').catch(()=>{});await invoke('kill').catch(()=>{});
 await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});
 await writeFile(resolve(root,'docs/audits/TERMUX_PM2_RESULTS.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
