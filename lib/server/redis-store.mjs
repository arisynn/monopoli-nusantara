// Upstash Redis REST: no database credentials or provider SDK in the client.
// Lua keeps compare-and-swap, limits, and AI leases atomic across Vercel instances.
const CREATE = `if redis.call('EXISTS',KEYS[1]) == 1 then return 0 end
redis.call('HSET',KEYS[1],'data',ARGV[1],'revision',0,'updated',ARGV[2])
redis.call('EXPIRE',KEYS[1],ARGV[3]); return 1`;
const COMMIT = `if redis.call('HGET',KEYS[1],'revision') ~= ARGV[1] then return 0 end
redis.call('HSET',KEYS[1],'data',ARGV[2],'updated',ARGV[3])
redis.call('HINCRBY',KEYS[1],'revision',1)
redis.call('EXPIRE',KEYS[1],ARGV[4]); return 1`;
const QUOTA = `local n = redis.call('INCR',KEYS[1])
if n == 1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`;
const LOCK = `if redis.call('HGET',KEYS[1],'revision') ~= ARGV[1] then return 0 end
if redis.call('SET',KEYS[2],ARGV[2],'NX','PX',ARGV[3]) then return 1 end; return 0`;
const UNLOCK = `if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end; return 0`;
const bounded=(value,fallback,min,max)=>Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max?Number(value):fallback;

export function redisConfig(env){
 const url=env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL;
 const token=env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
 if(!url||!token)return null;
 // Namespace is stable across production deployments, separate from previews.
 const scope=env.VERCEL_ENV==='production'?'production':env.VERCEL_ENV==='preview'?'preview':'development';
 const prefix=env.ROOM_NAMESPACE||`nusantara:v2:${scope}`;
 return {url,token,prefix,ttl:bounded(env.ROOM_TTL_SECONDS,604800,3600,2592000)};
}
export function createRedisStore(config,transport=fetch){
 const url=new URL(config.url);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Konfigurasi penyimpanan room tidak valid.');
 const prefix=String(config.prefix||'nusantara:v2:development');
 if(!/^[a-zA-Z0-9:_-]{1,100}$/.test(prefix))throw Error('ROOM_NAMESPACE tidak valid.');
 const ttl=bounded(config.ttl,604800,3600,2592000);
 const roomKey=code=>`${prefix}:room:{${code}}`;
 async function run(args){
  let result;
  try{
   const response=await transport(url.href,{method:'POST',cache:'no-store',headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('Redis HTTP error');
   result=await response.json();
   if(result.error||!Object.hasOwn(result,'result'))throw Error('Redis command error');
  }catch{throw Error('Penyimpanan room belum dapat dihubungi. Periksa konfigurasi server atau coba lagi.');}
  return result.result;
 }
 const evaluate=(script,keys,args)=>run(['EVAL',script,keys.length,...keys,...args.map(String)]);
 return {
  async get(code){const values=await run(['HMGET',roomKey(code),'data','revision','updated']);if(!values?.[0])return null;return {code,data:values[0],revision:Number(values[1]),updated:Number(values[2])}},
  async create(room){return await evaluate(CREATE,[roomKey(room.code)],[JSON.stringify(room),Date.now(),ttl])===1},
  async commit(row,room){return await evaluate(COMMIT,[roomKey(room.code)],[row.revision,JSON.stringify(room),Date.now(),ttl])===1},
  async quota(key,seconds=172800){return Number(await evaluate(QUOTA,[`${prefix}:quota:${key}`],[seconds]))},
  async acquire(row,owner){return await evaluate(LOCK,[roomKey(row.code),roomKey(row.code)+':ai'],[row.revision,owner,30000])===1},
  async release(row,owner){await evaluate(UNLOCK,[roomKey(row.code)+':ai'],[owner])}
 };
}
