import {readFile, writeFile} from 'node:fs/promises';
const filename=new URL('../.lab-settings.json',import.meta.url);
const action=process.argv[2]||'show';
let settings={mode:'spectator',delayMs:65};
try{const obj=JSON.parse(await readFile(filename,'utf8'));if(['spectator','performance','off'].includes(obj.mode))settings.mode=obj.mode;if(Number.isInteger(obj.delayMs)&&obj.delayMs>=0&&obj.delayMs<=1000)settings.delayMs=obj.delayMs;}catch{}
if(action==='show')console.log(JSON.stringify(settings));
else if(action==='get') {if(!['mode','delayMs'].includes(process.argv[3]))process.exitCode=1;else console.log(settings[process.argv[3]]);}
else if(action==='set') {
 const mode=process.argv[3],delayMs=Number(process.argv[4]);
 if(!['spectator','performance','off'].includes(mode)||!Number.isInteger(delayMs)||delayMs<0||delayMs>1000){console.error('Invalid settings');process.exit(1)}
 settings={mode,delayMs};await writeFile(filename,JSON.stringify(settings,null,2)+'\n');console.log('Tersimpan:',JSON.stringify(settings));
}else{console.error('Unknown settings command');process.exitCode=1;}
