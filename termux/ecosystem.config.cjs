const path=require('node:path');
module.exports={apps:[{name:'nusa-online-worker',cwd:path.resolve(__dirname,'..'),script:'termux/run.mjs',instances:1,exec_mode:'fork',
 autorestart:true,exp_backoff_restart_delay:1000,max_memory_restart:'512M',kill_timeout:35000,
 out_file:path.resolve(__dirname,'../.nusa-online/pm2-out.log'),error_file:path.resolve(__dirname,'../.nusa-online/pm2-error.log'),
 log_date_format:'YYYY-MM-DD HH:mm:ss',merge_logs:true,max_restarts:20,min_uptime:10000}]};
