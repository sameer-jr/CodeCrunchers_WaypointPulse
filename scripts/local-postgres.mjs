import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { chmod, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { root } from './process.mjs';

// pg_ctl performs a graceful shutdown, including PostgreSQL 18's Windows I/O workers.
export async function localPostgres(options) {
  const directory = resolve(options.databaseDir);
  const scopedPath = relative(resolve(root, '.local'), directory);
  if (!scopedPath || scopedPath.startsWith('..') || scopedPath.includes(':')) throw new Error('Managed PostgreSQL must be in a dedicated .local subdirectory.');
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const { pg_ctl: control } = await import(`@embedded-postgres/${platform}-${process.arch}`);
  if (process.platform !== 'win32') await chmod(control, 0o755);
  const embedded = new EmbeddedPostgres({ ...options, persistent: true });
  let started = false;
  let stopping;
  function runControl(args) {
    return new Promise((done, reject) => {
      const child = spawn(control, ['-D', directory, '-w', '-t', '60', ...args], { windowsHide: true, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? done() : reject(new Error(`PostgreSQL control failed (${code}); inspect ${resolve(directory, 'server.log')}.`)));
    });
  }
  return {
    initialise: () => embedded.initialise(),
    getPgClient: (...args) => embedded.getPgClient(...args),
    async start() {
      await runControl(['start', '-l', resolve(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${options.port}`]);
      started = true;
    },
    async createDatabase(name) {
      const client = embedded.getPgClient();
      await client.connect();
      try { await client.query(`CREATE DATABASE ${client.escapeIdentifier(name)}`); }
      finally { await client.end(); }
    },
    stop() {
      stopping ??= (async () => {
        if (started) { await runControl(['stop', '-m', 'fast']); started = false; }
        if (options.persistent === false) await rm(directory, { recursive: true, force: true });
      })();
      return stopping;
    },
  };
}
