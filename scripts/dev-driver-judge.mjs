import 'dotenv/config';
import { spawn } from 'node:child_process';
import { root } from './process.mjs';

const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || !['/waypoint', '/waypoint_driver_judge'].includes(url.pathname)) {
  throw new Error('Driver preview requires the configured local development database.');
}
url.pathname = '/waypoint_driver_judge';
const preview = process.argv.includes('--preview');
const env = { ...process.env, DATABASE_URL: url.toString(), STORE_ALLOW_SYNTHETIC: 'true', PLANNING_ALLOW_SYNTHETIC: 'true', NODE_ENV: 'development',
  DISPATCHER_DEMO_DATE: '2040-03-05', WEB_ORIGIN: 'http://localhost:5178', API_PORT: '3005', API_PROXY_TARGET: 'http://127.0.0.1:3005' };
const webArgs = ['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), 'apps/web', '--config', 'apps/web/vite.config.ts', '--port', '5178', '--host', '127.0.0.1', '--strictPort'];
const children = [
  spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'apps/api/src/server.ts'], { cwd: root, env, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, webArgs, { cwd: root, env, stdio: 'inherit', windowsHide: true })
];
let stopping = false;
function stop() { if (!stopping) { stopping = true; for (const child of children) child.kill(); } }
for (const child of children) {
  child.on('error', () => { console.error('Driver preview failed to start. Check database and port readiness.'); process.exitCode = 1; stop(); });
  child.on('exit', code => { if (!stopping) { process.exitCode = code ?? 1; stop(); } });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
console.log(`SYNTHETIC Driver ${preview ? 'built PWA preview' : 'development'}: http://localhost:5178. Use the built preview for service-worker offline acceptance.`);
