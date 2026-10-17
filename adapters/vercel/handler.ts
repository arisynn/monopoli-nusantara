import type {IncomingMessage,ServerResponse} from 'node:http';
import {handleRequest} from '../node/router.mjs';
/** Vercel transport wrapper; the existing Fetch handlers retain all authority. */
export default async function handler(req:IncomingMessage,res:ServerResponse){
 try{
  const origin=`https://${req.headers.host||'localhost'}`,url=new URL(req.url||'/',origin),endpoint=url.searchParams.get('_endpoint');
  if(url.origin!==origin){res.statusCode=400;res.end();return;}
  if(endpoint&&!['online','bot','game'].includes(endpoint)){res.statusCode=404;res.end();return;}
  if(endpoint){url.pathname='/api/'+endpoint;url.searchParams.delete('_endpoint');}
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buffer.length;if(size>131072){res.statusCode=413;res.end('Too large');return;}chunks.push(buffer);}
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method||'GET')?{body:Uint8Array.from(Buffer.concat(chunks)).buffer}:{})});
  const response=await handleRequest(request);res.statusCode=response.status;for(const [key,value] of response.headers)res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.statusCode=500;res.end(JSON.stringify({error:'Permintaan belum dapat diproses.'}));}
}
