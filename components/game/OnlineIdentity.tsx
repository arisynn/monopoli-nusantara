'use client';
import {useState} from 'react';
import type {OnlineAuth} from '@/lib/online-client.mjs';
export default function OnlineIdentity({auth,onChange,onError}:{auth:OnlineAuth;onChange:()=>void;onError:(s:string)=>void}) {
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),[notice,setNotice]=useState('');
 const user=auth.session()?.user, guest=user?.is_anonymous;
 async function run(type:'guest'|'login'|'signup'|'link') {
  if(busy)return;setBusy(true);setNotice('');
  try {
   const result=type==='guest'?await auth.guest():await auth[type](email,password);
   setPassword('');onChange();
   if(type==='signup'&&!result.access_token||type==='link')setNotice('Periksa email konfirmasi, lalu masuk dengan akun ini untuk bermain di perangkat lain.');
  }catch(e:any){onError(e.message)}finally{setBusy(false)}
 }
 return <section className="online-identity" aria-label="Identitas online">
  <div className="online-identity-heading"><b>{user?guest?'Identitas tamu aktif':user.email||'Akun terhubung':'Identitas pemain'}</b><button type="button" className="text-link" onClick={()=>setExpanded(v=>!v)}>{expanded?'Tutup':user?guest?'Tautkan akun':'Pulihkan akun':'Masuk / daftar'}</button></div>
  {!user&&<button type="button" className="secondary" disabled={busy} onClick={()=>run('guest')}>Main sebagai tamu</button>}
  {(!user||guest)&&<p className="fine">Tamu dikenali di browser ini. Tautkan email dan kata sandi agar kursi yang sama bisa dipulihkan di perangkat lain. Jangan hapus data browser sebelum ditautkan.</p>}
  {expanded&&<form onSubmit={e=>{e.preventDefault();void run(guest?'link':'login')}}><label className="field-label">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field-label">Kata sandi<input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="online-button-row"><button className="secondary" type="submit" disabled={busy}>{guest?'Tautkan identitas tamu':'Masuk'}</button>{guest&&<button className="secondary" type="button" disabled={busy||!email||password.length<8} onClick={()=>run('login')}>Masuk akun lain</button>}{!user&&<button className="secondary" type="button" disabled={busy||!email||password.length<8} onClick={()=>run('signup')}>Daftar</button>}</div>{guest&&<p className="fine">Beralih akun tidak memindahkan kursi tamu. Tautkan identitas ini dahulu jika masih memiliki pertandingan.</p>}{user&&!guest&&<p className="fine">Masuk hanya dengan akun pemilik kursi. Berganti akun tidak memindahkan kursi lama.</p>}</form>}
  {notice&&<p className="fine" role="status">{notice}</p>}
 </section>;
}
