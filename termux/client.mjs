import {OnlinePerformance} from '../lib/online-performance.mjs';
import {saveConfig} from './config.mjs';
import {MODEL_MANIFEST_ID,WORKER_PROTOCOL} from '../lib/bot/model-manifest.mjs';
export class WorkerClient{
 constructor(config,{transport=fetch,persist=saveConfig}={}){this.config=config;this.transport=transport;this.persist=persist;this.refreshing=null;this.performance=new OnlinePerformance();this.metrics={requests:0,sentBytes:0,receivedBytes:0,lastRttMs:0};}
 async request(op,data={},timeout=12000){
  const body=JSON.stringify({...data,op,protocol:WORKER_PROTOCOL,manifest:MODEL_MANIFEST_ID}),started=performance.now();
  this.metrics.requests++;this.metrics.sentBytes+=new TextEncoder().encode(body).length;
  const response=await this.transport(`${this.config.api}/api/worker`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.config.token}`},
   body,signal:AbortSignal.timeout(timeout)});
  const text=await response.text();this.metrics.receivedBytes+=new TextEncoder().encode(text).length;this.metrics.lastRttMs=Math.round(performance.now()-started);
  let result;try{result=JSON.parse(text);}catch{throw Error('Backend mengirim respons worker yang tidak valid.');}
  if(!response.ok){const error=Error(result.error||`Worker HTTP ${response.status}`);error.status=response.status;throw error;}
  this.performance.record("http."+op,performance.now()-started,{trace:result._performance?.trace});
  if(result._performance)for(const [stage,ms]of Object.entries(result._performance.spans||{}))this.performance.record("backend."+stage,ms,{trace:result._performance.trace});
  return result;
 }
 async sessionToken(){
  if(this.config.session?.expires_at>Date.now()/1000+90)return this.config.session.access_token;
  if(this.refreshing)return this.refreshing;
  this.refreshing=(async()=>{
   if(!this.config.session?.refresh_token)throw Error('Sesi Realtime berakhir; jalankan pairing kembali.');
   const response=await this.transport(`${this.config.api}/api/auth?op=refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:this.config.session.refresh_token}),signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('Sesi Realtime belum dapat diperbarui; recovery polling tetap aktif.');
   const s=await response.json();this.config.session={access_token:s.access_token,refresh_token:s.refresh_token,expires_at:Date.now()/1000+s.expires_in};await this.persist(this.config);return s.access_token;
  })().finally(()=>{this.refreshing=null;});
  return this.refreshing;
 }
}
export function subscribeWork(client,onHint,onStatus){
 let socket,retry,heartbeat,closed=false,failures=0,ref=0;
 const topic='realtime:mn-worker:default';
 const send=(event,payload,target=topic)=>{if(socket?.readyState===1)socket.send(JSON.stringify({topic:target,event,payload,ref:String(++ref)}));};
 const connect=async()=>{
  if(closed)return;
  try{
   const token=await client.sessionToken();if(closed)return;
   socket=new WebSocket(`${client.config.supabaseUrl.replace(/^http/,'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(client.config.publicKey)}&vsn=1.0.0`);
   socket.onopen=()=>{
    send('phx_join',{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'UPDATE',schema:'public',table:'mn_worker_wake',filter:'id=eq.default'}]},access_token:token});
    heartbeat=setInterval(async()=>{send('heartbeat',{},'phoenix');try{send('access_token',{access_token:await client.sessionToken()});}catch{socket?.close();}},25000);
   };
   socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
    if(m.event==='phx_reply'&&m.topic===topic){if(m.payload?.status==='ok'){failures=0;onStatus(true);onHint();}else socket.close();}
    if(m.event==='postgres_changes')onHint();
    if(['phx_error','phx_close','system'].includes(m.event)&&m.payload?.status!=='ok')socket.close();
   };
   socket.onerror=()=>socket.close();
   socket.onclose=()=>{clearInterval(heartbeat);onStatus(false);if(!closed)retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(failures++,5))*(.8+Math.random()*.4));};
  }catch{onStatus(false);if(!closed)retry=setTimeout(connect,15000);}
 };
 void connect();return()=>{closed=true;clearTimeout(retry);clearInterval(heartbeat);if(socket){socket.onclose=null;socket.close();}};
}
