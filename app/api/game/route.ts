import {getRuntime} from '@/lib/server/runtime';
import {createGame,command,publicState,decisionActor,chooseBot} from '@/lib/game.mjs';
import {aiDecision} from '@/lib/groq';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=30;
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const response=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function check(ok:unknown,msg:string):asserts ok{if(!ok)throw Error(msg)}
function view(room:any,seat:number,context:any){return {code:room.code,mode:room.mode,seat,seats:room.seats.map((s:any,i:number)=>({name:s.name,ready:s.ready,id:i,controller:s.controller})),state:room.state?publicState(room.state):null,rules:room.rules||'digital',created:room.created,online:true,hosting:context.hosting,groq:!!context.env.GROQ_API_KEY}}
async function quota(store:any,key:string,max:number,seconds=172800){const count=await store.quota(key,seconds);check(count<=max,'Batas permintaan tercapai. Coba kembali nanti.')}
async function commit(store:any,row:any,room:any){check(await store.commit(row,room),'State berubah. Muat ulang lalu coba lagi.')}
async function seatFor(room:any,token:string){const digest=await hash(token);return room.seats.findIndex((s:any)=>s.token===digest)}
export async function GET(request:Request){try{const context=getRuntime(),store=context.store;const url=new URL(request.url);if(url.searchParams.has('status'))return response({groq:!!store&&!!context.env.GROQ_API_KEY,online:!!store,hosting:context.hosting});check(store,'Room online belum diaktifkan pada situs ini. Mode lokal tetap tersedia.');let code=(url.searchParams.get('code')||'').toUpperCase();check(/^[A-Z2-9]{6}$/.test(code),'Kode room harus 6 karakter.');let row=await store!.get(code);check(row,'Room tidak ditemukan.');let room=JSON.parse(row.data),seat=await seatFor(room,request.headers.get('X-Room-Token')||'');check(seat>=0,'Kursi tidak dikenali. Gabung melalui kode room.');return response(view(room,seat,context))}catch(e:any){return response({error:e.message},400)}}
export async function POST(request:Request){try{
 const context=getRuntime(),store=context.store;check(store,'Room online belum diaktifkan pada situs ini. Mode lokal tetap tersedia.');
 const text=await request.text();check(text.length<=16384,'Permintaan terlalu besar.');const body=JSON.parse(text);const type=body.type;
 const origin=request.headers.get('Origin');check(!origin||origin===new URL(request.url).origin,'Origin tidak diizinkan.');
 if(type==='CREATE'){
  const user=context.creatorId(request),day=new Date().toISOString().slice(0,10);await quota(store,`create:${await hash(user)}:${day}`,30);if(context.hosting==='vercel')await quota(store,`create-global:${day}`,300);
  let token=crypto.randomUUID()+crypto.randomUUID();let code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%31]).join('');const mode=body.mode==='ai'?'ai':'online';
  let room:any={code,mode,rules:body.rules==='classic'?'classic':'digital',created:Date.now(),seats:[{name:String(body.name||'Penjelajah').trim().slice(0,24)||'Penjelajah',token:await hash(token),ready:true,controller:'human'}],state:null};
  if(mode==='ai'){room.seats.push({name:'Raka',token:'bot',ready:true,controller:'bot'});room.state=createGame({players:room.seats,difficulty:body.difficulty,rules:room.rules},random);room.state.aiStatus=context.env.GROQ_API_KEY?'Groq siap':'Bot cadangan aktif'}
  let saved=false;for(let attempt=0;attempt<5;attempt++){if(await store!.create(room)){saved=true;break}room.code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%31]).join('')}check(saved,'Kode room belum tersedia. Coba kembali.');return response({...view(room,0,context),token});
 }
 let code=String(body.code||'').toUpperCase();check(/^[A-Z2-9]{6}$/.test(code),'Kode room harus 6 karakter.');if(type==='JOIN'&&context.hosting==='vercel')await quota(store,`join:${await hash(context.creatorId(request))}:${Math.floor(Date.now()/60000)}`,30,120);let row=await store!.get(code);check(row,'Room tidak ditemukan.');let room=JSON.parse(row.data);
 if(type==='JOIN'){check(room.mode==='online'&&!room.state,'Pertandingan sudah dimulai.');check(room.seats.length<6,'Room sudah penuh.');let token=crypto.randomUUID()+crypto.randomUUID();room.seats.push({name:String(body.name||'Penjelajah').trim().slice(0,24)||'Penjelajah',token:await hash(token),ready:false,controller:'human'});await commit(store,row,room);return response({...view(room,room.seats.length-1,context),token})}
 const seat=await seatFor(room,request.headers.get('X-Room-Token')||'');check(seat>=0,'Kursi tidak dikenali.');
 if(type==='READY'){check(!room.state,'Pertandingan sudah dimulai.');room.seats[seat].ready=!!body.ready}
 else if(type==='START'){check(seat===0,'Hanya pembuat room yang dapat memulai.');check(!room.state&&room.seats.length>=2&&room.seats.every((s:any)=>s.ready),'Tunggu minimal 2 pemain dan semua siap.');room.state=createGame({players:room.seats,rules:room.rules},random)}
 else if(type==='ACTION'){check(room.state,'Pertandingan belum dimulai.');check(typeof body.action?.id==='string'&&body.action.id.length<=80,'ID perintah diperlukan.');check(Number.isInteger(body.action.expectedVersion),'Versi state diperlukan.');room.state=command(room.state,seat,body.action,random)}
 else if(type==='AI'){
  check(room.state&&room.mode==='ai'&&room.state.phase!=='won','Tidak ada keputusan AI.');let actor=decisionActor(room.state);check(room.state.players[actor].controller==='bot','Menunggu pemain manusia.');
  const lease=crypto.randomUUID();check(await store!.acquire(row,lease),'AI sedang memilih.');
  let result:any;try{if(context.env.GROQ_API_KEY){try{await quota(store,`groq:${new Date().toISOString().slice(0,10)}`,1000);result=await aiDecision(room.state,actor,context.env)}catch{result={action:chooseBot(room.state,actor),status:'Bot cadangan aktif',comment:'Batas layanan AI tercapai; bot lokal mengambil alih.'}}}else result={action:chooseBot(room.state,actor),status:'Bot cadangan aktif',comment:null};room.state=command(room.state,actor,{...result.action,id:crypto.randomUUID(),expectedVersion:room.state.version},random);room.state.aiStatus=result.status;if(result.comment)room.state.aiComment=result.comment;await commit(store,row,room)}finally{await store!.release(row,lease)}return response(view(room,seat,context));
 }
 else throw Error('Permintaan tidak dikenal.');await commit(store,row,room);return response(view(room,seat,context));
 }catch(e:any){return response({error:e.message||'Permintaan gagal.'},400)}}
