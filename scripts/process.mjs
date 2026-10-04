import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function runNode(script, args = [], env = process.env) {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(root, script), ...args], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? done() : reject(new Error(`${script} exited with code ${code}.`)));
  });
}
export async function initializeDatabase(env) {
  await runNode('node_modules/prisma/build/index.js', ['migrate', 'deploy'], env);
  await runNode('node_modules/tsx/dist/cli.mjs', ['prisma/seed.ts'], env);
}
