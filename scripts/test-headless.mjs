import {run} from 'node:test';import {mkdirSync,writeFileSync} from 'node:fs';
const names=['game','classic','storage','save-format','room-client','online','online-client','online-api','bot-strategy','groq-hybrid','bot-api','online-bots','mind-headless','presentation-headless','headless-package','frontend'];
const files=names.map(n=>'tests/'+n+'.test.mjs'),failures=[];let summary;
for await(const event of run({files,isolation:'none',concurrency:false})){
 if(event.type==='test:fail'){failures.push({name:event.data.name,error:String(event.data.details?.error)});console.error('FAIL',event.data.name,event.data.details?.error);}
 if(event.type==='test:summary')summary=event.data;
}
const report={generatedAt:new Date().toISOString(),node:process.version,files,tests:summary?.counts?.tests||0,passed:summary?.counts?.passed||0,failed:summary?.counts?.failed??failures.length,skipped:summary?.counts?.skipped||0,failures,limits:['No real Supabase/Auth/Postgres/RLS/Realtime or Groq service was contacted.','HTTP tests call real fetch handlers in process with contract doubles; listening socket not verified.','Browser-only storage/Auth/worker adapters use mocks or Node worker tests; frontend renderer/session tested in process; real browser layout unverified.','Native Node TypeScript stripping is not semantic tsc validation.']};
mkdirSync('docs',{recursive:true});writeFileSync('docs/QA_KEPULAUAN_RESULTS.json',JSON.stringify(report,null,2)+'\n');console.log(`Core + frontend results: ${report.passed}/${report.tests}, failed ${report.failed}, skipped ${report.skipped}.`);process.exitCode=report.tests>0&&report.failed===0&&failures.length===0?0:1;
