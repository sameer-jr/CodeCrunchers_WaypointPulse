import { config } from 'dotenv';
import { resolve } from 'node:path';
import { localPostgres } from './local-postgres.mjs';
import { initializeDatabase, root, runNode } from './process.mjs';

config({ path: resolve(root, '.env'), quiet: true });
const url = new URL(process.env.DATABASE_URL ?? '');
if (process.env.NODE_ENV === 'production' || url.hostname !== '127.0.0.1' || !['/waypoint', '/waypoint_loader_judge'].includes(url.pathname)) {
  throw new Error('Loader judge setup requires the workspace local PostgreSQL service. Start npm run dev:db first.');
}
const database = await localPostgres({ databaseDir: resolve(root, '.local/postgres'), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), port: Number(url.port), persistent: true });
const client = database.getPgClient('postgres', '127.0.0.1');
await client.connect();
let exists;
try { exists = (await client.query('SELECT 1 FROM pg_database WHERE datname=$1', ['waypoint_loader_judge'])).rowCount > 0; }
finally { await client.end(); }
if (!exists) await database.createDatabase('waypoint_loader_judge');
url.pathname = '/waypoint_loader_judge';
const env = { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'development', STORE_ALLOW_SYNTHETIC: 'true', PLANNING_ALLOW_SYNTHETIC: 'true', DISPATCHER_DEMO_DATE: '2040-03-05' };
await initializeDatabase(env);
await runNode('node_modules/tsx/dist/cli.mjs', ['scripts/loader-judge-fixtures.ts'], env);
console.log('PASS: independent Loader judge demand is ready. Generate, Validate and Release through Dispatcher before Loader use.');
console.log('Run npm run dev:loader-judge. Main, M4 and M5 judge data are preserved; repeated setup retains operational history.');
