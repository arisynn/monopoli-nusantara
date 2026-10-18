// PM2 imports entry modules through its own process container, so argv[1] is
// not this filename. Keep the unconditional entry separate from testable code.
import {runDaemon} from './daemon.mjs';
runDaemon().catch(()=>{console.error('Worker gagal dimulai. Periksa pairing, koneksi, atau proses yang sudah berjalan.');process.exitCode=1;});
