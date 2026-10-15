import {createRedisStore,redisConfig} from './redis-store.mjs';
// Default runtime is Node.js (Next.js / Vercel). Vite replaces this module for Sites.
export function getRuntime(){
 const env=process.env,config=redisConfig(env);
 return {
  env,store:config?createRedisStore(config):null,hosting:'vercel',
  creatorId(request:Request){
   // On Vercel this header is supplied by the platform. Never trust ChatGPT headers here.
   const address=env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim():null;
   return `guest:${address||'local-or-unidentified'}`;
  }
 };
}
