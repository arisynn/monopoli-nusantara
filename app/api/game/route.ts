import {env} from 'cloudflare:workers';
import {createGame,command,publicState,decisionActor,chooseBot} from '@/lib/game.mjs';
import {aiDecision} from '@/lib/groq';
export const dynamic='force-dynamic';
const runtime=()=>env as any;
const random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const response=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const check=(ok:any,msg:string)=>{if(!ok)throw Error(msg)};
function view(room:any,seat:number){return {code:room.code,mode:room.mode,seat,seats:room.seats.map((s:any,i:number)=>({name:s.name,ready:s.ready,id:i,controller:s.controller})),state:room.state?publicState(room.state):null,created:room.created,groq:!!runtime().GROQ_API_KEY}}
async function getRoom(code:string){return runtime().DB.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first()}
async function quota(key:string,max:number){let row=await runtime().DB.prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first();check(row.count<=max,'Batas permintaan tercapai. Coba kembali besok.');}
async function commit(row:any,room:any){const result=await runtime().DB.prepare('UPDATE rooms SET data=?,revision=revision+1,updated=? WHERE code=? AND revision=?').bind(JSON.stringify(room),Date.now(),room.code,row.revision).run();check(result.meta.changes===1,'State berubah. Muat ulang lalu coba lagi.')}
async function seatFor(room:any,token:string){const digest=await hash(token);return room.seats.findIndex((s:any)=>s.token===digest)}
export async function GET(request:Request){try{const url=new URL(request.url);if(url.searchParams.has('status'))return response({groq:!!runtime().GROQ_API_KEY,online:!!runtime().DB});let code=(url.searchParams.get('code')||'').toUpperCase();let row=await getRoom(code);check(row,'Room tidak ditemukan.');let room=JSON.parse(row.data),seat=await seatFor(room,request.headers.get('X-Room-Token')||'');check(seat>=0,'Kursi tidak dikenali. Gabung melalui kode room.');return response(view(room,seat))}catch(e:any){return response({error:e.message},400)}}
export async function POST(request:Request){try{
 const body=await request.json() as any;const type=body.type;const db=runtime().DB;check(db,'Layanan room belum tersedia.');
 const origin=request.headers.get('Origin');check(!origin||origin===new URL(request.url).origin,'Origin tidak diizinkan.');
 if(type==='CREATE'){
  const user=request.headers.get('oai-authenticated-user-id');check(user,'Masuk melalui ChatGPT untuk membuat room.');await quota(`create:${await hash(user!)}:${new Date().toISOString().slice(0,10)}`,30);
  let token=crypto.randomUUID()+crypto.randomUUID();let code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%31]).join('');const mode=body.mode==='ai'?'ai':'online';
  let room:any={code,mode,created:Date.now(),seats:[{name:String(body.name||'Penjelajah').trim().slice(0,24)||'Penjelajah',token:await hash(token),ready:true,controller:'human'}],state:null};
  if(mode==='ai'){room.seats.push({name:'Raka',token:'bot',ready:true,controller:'bot'});room.state=createGame({players:room.seats,difficulty:body.difficulty},random);room.state.aiStatus=runtime().GROQ_API_KEY?'Groq siap':'Bot cadangan aktif'}
  await db.prepare('INSERT INTO rooms (code,data,revision,updated) VALUES (?,?,0,?)').bind(code,JSON.stringify(room),Date.now()).run();return response({...view(room,0),token});
 }
 let code=String(body.code||'').toUpperCase(),row=await getRoom(code);check(row,'Room tidak ditemukan.');let room=JSON.parse(row.data);
 if(type==='JOIN'){check(room.mode==='online'&&!room.state,'Pertandingan sudah dimulai.');check(room.seats.length<4,'Room sudah penuh.');let token=crypto.randomUUID()+crypto.randomUUID();room.seats.push({name:String(body.name||'Penjelajah').trim().slice(0,24)||'Penjelajah',token:await hash(token),ready:false,controller:'human'});await commit(row,room);return response({...view(room,room.seats.length-1),token})}
 const seat=await seatFor(room,request.headers.get('X-Room-Token')||'');check(seat>=0,'Kursi tidak dikenali.');
 if(type==='READY'){check(!room.state,'Pertandingan sudah dimulai.');room.seats[seat].ready=!!body.ready}
 else if(type==='START'){check(seat===0,'Hanya pembuat room yang dapat memulai.');check(!room.state&&room.seats.length>=2&&room.seats.every((s:any)=>s.ready),'Tunggu minimal 2 pemain dan semua siap.');room.state=createGame({players:room.seats},random)}
 else if(type==='ACTION'){check(room.state,'Pertandingan belum dimulai.');check(typeof body.action?.id==='string'&&body.action.id.length<=80,'ID perintah diperlukan.');check(Number.isInteger(body.action.expectedVersion),'Versi state diperlukan.');room.state=command(room.state,seat,body.action,random)}
 else if(type==='AI'){
  check(room.state&&room.mode==='ai'&&room.state.phase!=='won','Tidak ada keputusan AI.');let actor=decisionActor(room.state);check(room.state.players[actor].controller==='bot','Menunggu pemain manusia.');
  const locked=await db.prepare('UPDATE rooms SET ai_until=? WHERE code=? AND revision=? AND ai_until<?').bind(Date.now()+8000,code,row.revision,Date.now()).run();check(locked.meta.changes===1,'AI sedang memilih.');
  let result:any;try{if(runtime().GROQ_API_KEY){try{await quota(`groq:${new Date().toISOString().slice(0,10)}`,1000);result=await aiDecision(room.state,actor,runtime())}catch{result={action:chooseBot(room.state,actor),status:'Bot cadangan aktif',comment:'Batas layanan AI tercapai; bot lokal mengambil alih.'}}}else result={action:chooseBot(room.state,actor),status:'Bot cadangan aktif',comment:null};room.state=command(room.state,actor,{...result.action,id:crypto.randomUUID(),expectedVersion:room.state.version},random);room.state.aiStatus=result.status;if(result.comment)room.state.aiComment=result.comment;await commit(row,room)}finally{await db.prepare('UPDATE rooms SET ai_until=0 WHERE code=?').bind(code).run()}return response(view(room,seat));
 }
 else throw Error('Permintaan tidak dikenal.');await commit(row,room);return response(view(room,seat));
 }catch(e:any){return response({error:e.message||'Permintaan gagal.'},400)}}
