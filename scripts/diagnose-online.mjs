// Reports presence/shape only. Never prints ENV values, public keys or server secrets.
import {existsSync,readFileSync,readdirSync} from 'node:fs';
const required=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'];
const variables=Object.fromEntries(required.map(name=>[name,!!process.env[name]?.trim()]));
let urlShape='missing';if(variables.SUPABASE_URL){try{const u=new URL(process.env.SUPABASE_URL);urlShape=u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash?'valid':'invalid'}catch{urlShape='invalid'}}
const environmentFiles=['.env','.env.local','.env.production'].filter(existsSync).map(file=>({file,automaticallyLoaded:false,namesPresent:required.filter(name=>new RegExp('^\\s*'+name+'\\s*=','m').test(readFileSync(file,'utf8')))}));
const migrationFiles=readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql'));
console.log(JSON.stringify({scope:'Local runtime configuration audit; no live Supabase request or credentials printed',configured:required.every(name=>variables[name])&&urlShape==='valid',variables,urlShape,environmentFiles,migrationFiles,liveAuth:'not verified',liveRLS:'not verified',liveRealtime:'not verified',note:'Node runtime reads process ENV. Use your server secret manager or node --env-file=.env; Vercel uses environment settings per deployment.'},null,2));
