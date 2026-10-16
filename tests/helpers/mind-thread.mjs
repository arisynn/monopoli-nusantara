import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:data=>parentPort.postMessage(data)};
await import('../../lib/bot/mind.worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
