import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webDirectory = fileURLToPath(new URL('../apps/web/', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [vite, 'build', ...process.argv.slice(2)], {
  cwd: webDirectory, env: { ...process.env, NODE_ENV: 'production' }, stdio: 'inherit', windowsHide: true
});
child.on('error', error => { console.error(`Web build could not start: ${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
