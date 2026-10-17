const groups = {
 SUPABASE_URL:['SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','PUBLIC_SUPABASE_URL','VITE_SUPABASE_URL'],
 SUPABASE_PUBLISHABLE_KEY:['SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','PUBLIC_SUPABASE_PUBLISHABLE_KEY','PUBLIC_SUPABASE_ANON_KEY','VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_ANON_KEY'],
 SUPABASE_SECRET_KEY:['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY'],
};
const clean=value=>typeof value==='string'?value.trim().replace(/^(["'])(.*)\1$/s,'$2').trim():'';
export function resolvedSupabaseEnv(env){
 const values=Object.fromEntries(Object.entries(groups).map(([key,names])=>[key,names.map(name=>clean(env[name])).find(Boolean)||'']));
 return {url:values.SUPABASE_URL,key:values.SUPABASE_PUBLISHABLE_KEY,secret:values.SUPABASE_SECRET_KEY};
}
function elevated(key){
 if(key.startsWith('sb_secret_'))return true;
 try{return JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role==='service_role';}catch{return false;}
}
/** Safe diagnostics contain names/codes only, never credential values. */
export function supabaseConfigurationStatus(env){
 const c=resolvedSupabaseEnv(env),missing=[],invalid=[];
 for(const [name,value] of [['SUPABASE_URL',c.url],['SUPABASE_PUBLISHABLE_KEY',c.key],['SUPABASE_SECRET_KEY',c.secret]])if(!value)missing.push(name);
 if(c.url){try{const u=new URL(c.url);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)invalid.push('invalid_url');}catch{invalid.push('invalid_url');}}
 if(c.key&&elevated(c.key))invalid.push('public_key_is_secret');
 return {configured:missing.length===0&&invalid.length===0,missing,invalid};
}
