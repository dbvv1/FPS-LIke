import { preview } from 'vite';
const server = await preview({ configFile: false, build: { outDir: 'web-dist' }, preview: { host: '127.0.0.1', port: 0, open: false } });
const address = server.httpServer.address();
if (!address || typeof address === 'string') throw new Error('No loopback address');
console.log(`FPS_LOOPBACK=http://127.0.0.1:${address.port}`);
let closing = false;
const close = () => { if (closing) return; closing = true; server.httpServer.closeAllConnections(); server.httpServer.close(); };
process.once('SIGINT', close); process.once('SIGTERM', close);
