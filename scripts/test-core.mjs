import {run} from 'node:test';
import {mkdirSync,writeFileSync} from 'node:fs';
const names=['game','classic','storage','save-format','room-client','ui-refinement','pawn-flow','asset-trade-v26','gameplay-flow-v28','compact-ui-v29','gameplay-v210','board-visual-v211','online','online-client','online-api','bot-strategy','groq-hybrid','bot-api','online-bots','experience-v45','experience-render-v45','mind-v46','player-experience'];
const files=names.map(name=>`tests/${name}.test.mjs`),results=[],failures=[];let summary;
// No child process: the managed sandbox may deny Node spawn despite an exit status of zero.
for await(const event of run({files,isolation:'none',concurrency:false})){
 if(event.type==='test:pass')results.push({file:event.data.file,name:event.data.name,success:true});
 if(event.type==='test:fail'){results.push({file:event.data.file,name:event.data.name,success:false});failures.push({name:event.data.name,error:String(event.data.details?.error)});console.error('FAIL',event.data.name,event.data.details?.error);}
 if(event.type==='test:summary')summary=event.data;
}
const tests=summary?.counts?.tests||0,passed=summary?.counts?.passed||0,skipped=summary?.counts?.skipped||0;
const report={generatedAt:new Date().toISOString(),node:process.version,files,tests,passed,skipped,failed:summary?.counts?.failed??failures.length,failures,
 limitations:['PostgreSQL, RLS, live Auth and live Realtime not exercised; online store/HTTP tests use contract doubles.','Full npm test includes React/TypeScript rendering suites unavailable before dependency installation.','Production bundling, semantic TypeScript, real React DOM/mobile QA and deployment have not passed. Isolated TSX fixtures use TypeScript or an existing Babel transform with hook/child stubs.']};
mkdirSync('docs',{recursive:true});writeFileSync('docs/QA_PLAYER_UI_RESULTS.json',JSON.stringify(report,null,2)+'\n');
console.log(`Core results: ${passed}/${tests} passed across ${files.length} files.`);
process.exitCode=tests>0&&report.failed===0&&failures.length===0?0:1;
