import { localPostgres } from './local-postgres.mjs';
import { config } from 'dotenv';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeDatabase, root } from './process.mjs';

config({ path: resolve(root, '.env'), quiet: true });
if (!process.env.DATABASE_URL) throw new Error('Run npm run setup:local first.');
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== '127.0.0.1' || url.pathname !== '/waypoint') {
  throw new Error('dev:db only manages the local /waypoint database at 127.0.0.1. Use your own PostgreSQL service for another URL.');
}
const directory = resolve(root, '.local', 'postgres');
mkdirSync(directory, { recursive: true });
const database = await localPostgres({ databaseDir: directory, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port), persistent: true,
  authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => console.error(String(message)) });
let started = false;
const keepAlive = setInterval(() => {}, 1_000_000);
async function stop() { clearInterval(keepAlive); if (started) { started = false; await database.stop(); } }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void stop().then(() => process.exit(0)); });
try {
  if (!existsSync(resolve(directory, 'PG_VERSION'))) await database.initialise();
  await database.start(); started = true;
  const client = database.getPgClient();
  await client.connect();
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', ['waypoint']);
  await client.end();
  if (!result.rowCount) await database.createDatabase('waypoint');
  await initializeDatabase(process.env);
  console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}; migration and safe auth seed initialized.`);
  console.log('Keep this terminal open. Ctrl+C stops PostgreSQL and preserves local data.');
} catch (error) { await stop(); throw error; }
