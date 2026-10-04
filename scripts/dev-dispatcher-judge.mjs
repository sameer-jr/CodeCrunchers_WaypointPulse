import 'dotenv/config';
import { spawn } from 'node:child_process';
import { root } from './process.mjs';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || !['/waypoint', '/waypoint_dispatcher_judge'].includes(url.pathname)) {
  throw new Error('Dispatcher judge preview requires the configured local development database.');
}
url.pathname = '/waypoint_dispatcher_judge';
const env = { ...process.env, DATABASE_URL: url.toString(), STORE_ALLOW_SYNTHETIC: 'true', NODE_ENV: 'development',
  DISPATCHER_DEMO_DATE: '2040-02-06', WEB_ORIGIN: 'http://localhost:5175', API_PORT: '3002', API_PROXY_TARGET: 'http://127.0.0.1:3002' };
const children = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'apps/api/src/server.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'apps/web', '--config', 'apps/web/vite.config.ts', '--port', '5175', '--host', '127.0.0.1', '--strictPort'], { cwd: root, env, stdio: 'inherit', windowsHide: true })
];
let stopping = false;
function stop() { if (!stopping) { stopping = true; for (const child of children) child.kill(); } }
for (const child of children) {
  child.on('error', () => { console.error('Judge preview failed to start. Check local database and port readiness.'); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
console.log('SYNTHETIC Dispatcher preview: http://localhost:5175. Keep one active localhost browser preview to avoid shared session cookies across ports.');
