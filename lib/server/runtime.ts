// Default runtime is Node.js (Next.js / Vercel). Vite replaces this module for Sites.
// Current multiplayer uses Supabase exclusively. This nullable legacy contract
// remains for the old handler, but Node/Vercel never activates a Redis store.
type LegacyStore=ReturnType<typeof import('./d1-store.mjs').createD1Store>;
export function getRuntime(){
 const env=process.env;
 return {
  env,store:null as LegacyStore|null,hosting:'vercel',
  creatorId(request:Request){
   // On Vercel this header is supplied by the platform. Never trust ChatGPT headers here.
   const address=env.VERCEL==='1'?request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim():null;
   return `guest:${address||'local-or-unidentified'}`;
  }
 };
}
