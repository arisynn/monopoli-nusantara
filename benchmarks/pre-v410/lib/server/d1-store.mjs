export function createD1Store(db){return {
 async get(code){return db.prepare('SELECT * FROM rooms WHERE code = ?').bind(code).first()},
 async create(room){const result=await db.prepare('INSERT OR IGNORE INTO rooms (code,data,revision,updated) VALUES (?,?,0,?)').bind(room.code,JSON.stringify(room),Date.now()).run();return result.meta.changes===1},
 async commit(row,room){const result=await db.prepare('UPDATE rooms SET data=?,revision=revision+1,updated=? WHERE code=? AND revision=?').bind(JSON.stringify(room),Date.now(),room.code,row.revision).run();return result.meta.changes===1},
 async quota(key){const row=await db.prepare('INSERT INTO quotas (key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key).first();return row.count},
 async acquire(row,owner){const until=Date.now()+30000;row.leaseUntil=until;const result=await db.prepare('UPDATE rooms SET ai_until=? WHERE code=? AND revision=? AND ai_until<?').bind(until,row.code,row.revision,Date.now()).run();return result.meta.changes===1},
 async release(row,owner){await db.prepare('UPDATE rooms SET ai_until=0 WHERE code=? AND ai_until=?').bind(row.code,row.leaseUntil).run()}
}}
