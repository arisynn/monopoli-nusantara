import {readFile,mkdir,writeFile,rename,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
export const ROOT=resolve(import.meta.dirname,'..');
export const DATA=resolve(process.env.NUSA_ONLINE_DATA||resolve(ROOT,'.nusa-online'));
export async function initData(){
 await mkdir(DATA,{recursive:true,mode:0o700});
 if(/^\/(?:sdcard|storage|mnt\/sdcard)(?:\/|$)/.test(await realpath(DATA)))throw Error('Pindahkan paket ke direktori privat Termux sebelum pairing.');
}
export async function saveConfig(config){
 await initData();const file=resolve(DATA,'config.json'),temp=file+'.tmp';
 await writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600});await rename(temp,file);
}
export async function loadConfig(){
 let c;try{c=JSON.parse(await readFile(resolve(DATA,'config.json'),'utf8'));}catch{throw Error('Konfigurasi belum tersedia atau rusak. Jalankan setup/pairing.');}
 const u=new URL(c.api);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('URL backend harus HTTPS.');
 if(u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Gunakan origin backend tanpa path atau credential.');
 if(!/^[a-f0-9]{64}$/.test(c.token))throw Error('Pairing worker belum lengkap.');
 if(!Number.isInteger(c.slots)||c.slots<1||c.slots>4)throw Error('Slot harus 1–4.');
 if(!Number.isInteger(c.budget)||c.budget<64||c.budget>2600)throw Error('Budget harus 64–2600 ms.');
 return c;
}
