import {getRuntime} from '@/lib/server/runtime';
import {supabaseConfig} from '@/lib/server/supabase-store.mjs';

/** Same-origin transport for the public GoTrue Auth endpoints.
 * Browser credentials never travel through the service-role database client.
 * Reject arbitrary paths and bodies: this must never become an open proxy. */
const methods = {guest:'POST',signup:'POST',login:'POST',refresh:'POST',link:'PUT',user:'GET'} as const;
type Operation=keyof typeof methods;
const error=(message:string,status:number)=>Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
const validText=(v:unknown,min:number,max:number)=>typeof v==='string'&&v.length>=min&&v.length<=max;
async function parseBody(request:Request){
 const declared=Number(request.headers.get('content-length')||0);
 if(declared>8192)return null;
 const reader=request.body?.getReader();if(!reader)return null;
 let length=0;const pieces:Uint8Array[]=[];
 try {while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192)return null;pieces.push(value)}}
 finally{await reader.cancel().catch(()=>{});}
 try{const data=new Uint8Array(length);let offset=0;for(const piece of pieces){data.set(piece,offset);offset+=piece.length;}
 const parsed=JSON.parse(new TextDecoder().decode(data));return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:null;
 }catch{return null;}
}
export async function handleAuthProxy(request:Request,env:NodeJS.ProcessEnv,transport:typeof fetch=fetch){
 const uri=new URL(request.url),op=uri.searchParams.get('op');
 if(!op||!Object.hasOwn(methods,op))return error('Operasi identitas tidak tersedia.',404);
 const operation=op as Operation;
 if(request.method!==methods[operation])return error('Metode identitas tidak sesuai.',405);
 if(request.headers.get('origin')&&request.headers.get('origin')!==uri.origin)return error('Origin tidak diizinkan.',403);
 const config=supabaseConfig(env);
 if(!config)return error('Server identitas belum dikonfigurasi.',503);
 const bearer=request.headers.get('authorization')||'';
 if((operation==='link'||operation==='user')&&!/^Bearer [^\s]{20,8192}$/.test(bearer))return error('Sesi tidak tersedia. Masuk kembali.',401);
 let body:Record<string,unknown>|null=null;
 if(operation!=='user'){
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return error('Gunakan data JSON.',415);
  body=await parseBody(request);
  if(!body)return error('Permintaan identitas tidak valid.',400);
  if(operation==='guest')body={data:{}};
  if(operation==='login'||operation==='signup'||operation==='link'){
   if(!validText(body.email,3,254)||!validText(body.password,6,128))return error('Periksa email dan password (minimal 6 karakter).',400);
   body={email:(body.email as string).trim(),password:body.password};
  }
  if(operation==='refresh'){
   if(!validText(body.refresh_token,16,4096))return error('Sesi berakhir. Masuk kembali.',401);
   body={refresh_token:body.refresh_token};
  }
 }
 const path=(operation==='login'?'token?grant_type=password':operation==='refresh'?'token?grant_type=refresh_token':
  operation==='guest'?'signup':operation==='user'?'user':
  operation==='link'?`user?redirect_to=${encodeURIComponent(uri.origin)}`:`signup?redirect_to=${encodeURIComponent(uri.origin)}`);
 let response:Response;
 try {response=await transport(`${config.url}/auth/v1/${path}`,{method:request.method,
  headers:{apikey:config.key,'Content-Type':'application/json',...((operation==='link'||operation==='user')?{Authorization:bearer}:{})},
  ...(operation==='user'?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(12000)});
 }catch{return error('Layanan identitas tidak dapat dijangkau dari server. Coba lagi.',503);}
 // Supabase Auth responds with JSON on both success and validation failures.
 // Never expose an unexpected HTML / proxy error or non-JSON upstream response.
 let payload:unknown;
 try{payload=await response.json();}catch{return error('Layanan identitas mengirim respons yang tidak valid.',502);}
 if(!response.ok){const p=(payload&&typeof payload==='object'?payload:{}) as Record<string,unknown>;
  const detail=[p.msg,p.error_description,p.message,p.error].find(v=>typeof v==='string'&&v.length<300);
  return error(typeof detail==='string'?detail:'Permintaan identitas ditolak.',response.status>=400&&response.status<=599?response.status:502);
 }
 return Response.json(payload,{status:response.status,headers:{'Cache-Control':'no-store','Vary':'Authorization'}});
}
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const GET=(request:Request)=>handleAuthProxy(request,getRuntime().env);
export const POST=(request:Request)=>handleAuthProxy(request,getRuntime().env);
export const PUT=(request:Request)=>handleAuthProxy(request,getRuntime().env);
