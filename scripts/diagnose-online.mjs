// Configuration names/codes only. Never print credentials or read their values from files.
import {existsSync,readdirSync} from 'node:fs';
import {supabaseConfigurationStatus} from '../lib/server/supabase-config.mjs';
const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const status=supabaseConfigurationStatus(process.env);
console.log(JSON.stringify({scope:'Local runtime only; no live database request',...status,variables:Object.fromEntries(names.map(name=>[name,!!process.env[name]?.trim()])),environmentFiles:['.env','.env.local','.env.production'].filter(existsSync),migrationFiles:readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')),redisRequired:false,guide:'ENV_REQUIRED.md',note:'Vercel ENV changes need a redeploy. Plugin access is separate from server runtime configuration.'},null,2));
