import {writeFile} from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map(v=>v.replace(/^--/,'').split('=')));
const origin=new URL(args.origin||'http://127.0.0.1:8787').origin,checks=[];
for(const path of ['/build.json','/api/online?config=1','/api/bot']){
 try{
  const target=new URL(path,origin);target.searchParams.set('_mn_check',String(Date.now()));
  const r=await fetch(target,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Monopoli-Nusantara-Diagnostics/4.9.0','Cache-Control':'no-cache'}}),text=await r.text();let data;
  try{data=JSON.parse(text)}catch{}
  checks.push({path,status:r.status,json:!!data,...(path==='/build.json'&&data?{version:data.version,build:data.build}:{}),...(path.startsWith('/api/online')&&data?{online:data.online,onlineBots:data.onlineBots,configuration:data.configuration,publicKeyPresent:!!data.key}:{}),...(path==='/api/bot'&&data?{configured:data.configured,model:data.model}:{}),...(!data?{error:text.includes('FUNCTION_INVOCATION_FAILED')?'FUNCTION_INVOCATION_FAILED':'non_json_response'}:{})});
 }catch{checks.push({path,error:'network_or_timeout'})}
}
const report={generatedAt:new Date().toISOString(),origin,checks,credentialsPrinted:false};
if(args.output)await writeFile(args.output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
