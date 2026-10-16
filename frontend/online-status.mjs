// Public UI states only. Presence of configuration is never a live connectivity claim.
export function onlineStatus(session){
 if(session.configStatus==='error')return {code:'error',label:'Koneksi gagal',detail:'Konfigurasi online belum dapat dimuat. Periksa koneksi lalu coba lagi.'};
 if(!session.config)return {code:'loading',label:'Memeriksa online…',detail:'Mengambil konfigurasi server.'};
 if(!session.config.online)return {code:'unconfigured',label:'Online belum dikonfigurasi',detail:'Server belum menyediakan konfigurasi Supabase. VS Bot tetap tersedia.'};
 if(!session.auth?.session())return {code:'signin',label:'Perlu masuk',detail:'Gunakan akun atau tamu untuk membuat dan bergabung ke room.'};
 if(session.room&&!session.connected)return {code:'disconnected',label:'Koneksi terputus',detail:'Mengambil state terbaru sebelum permainan dilanjutkan.'};
 return {code:'available',label:session.room?'Room terhubung':'Identitas tersedia',detail:session.room?'Room telah merespons.':'Siap meminta room. Koneksi database diperiksa saat room dibuka.'};
}
