import { localPostgres } from './local-postgres.mjs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeDatabase, root, runNode } from './process.mjs';
import { verifyDomainUpgrade, verifyFoundationUpgrade } from './migration-regression.mjs';

const port = await new Promise((done, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => done(address.port)); });
});
const directory = resolve(root, '.local', `test-postgres-${Date.now()}`);
mkdirSync(directory, { recursive: true });
const password = randomBytes(24).toString('hex');
const database = await localPostgres({ databaseDir: directory, user: 'waypoint_test', password, port, persistent: false,
  authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-h', '127.0.0.1'], onLog: () => {}, onError: message => console.error(String(message)) });
const databaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_test`;
const env = { ...process.env, DATABASE_URL: databaseUrl, TEST_DATABASE_URL: databaseUrl, NODE_ENV: 'test',
  AUTH_SECRET: randomBytes(48).toString('hex'), WEB_ORIGIN: 'http://localhost:5173', STORE_ALLOW_SYNTHETIC: 'false', PLANNING_ALLOW_SYNTHETIC: 'false',
  SEED_DEMO_PASSWORD: randomBytes(20).toString('hex'), PUBLIC_JUDGE_DEMO: 'false' };
let started = false;
try {
  await database.initialise();
  await database.start(); started = true;
  await database.createDatabase('waypoint_test');
  await initializeDatabase(env);
  await initializeDatabase(env);
  await verifyFoundationUpgrade(database, directory, env);
  await verifyDomainUpgrade(database, directory, env);
  await database.createDatabase('waypoint_store_test');
  const storeDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_store_test`;
  await initializeDatabase({ ...env, DATABASE_URL: storeDatabaseUrl });
  env.STORE_TEST_DATABASE_URL = storeDatabaseUrl;
  await database.createDatabase('waypoint_dispatcher_test');
  const dispatcherDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_dispatcher_test`;
  await initializeDatabase({ ...env, DATABASE_URL: dispatcherDatabaseUrl });
  env.DISPATCHER_TEST_DATABASE_URL = dispatcherDatabaseUrl;
  await database.createDatabase('waypoint_allocation_test');
  const allocationDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_allocation_test`;
  await initializeDatabase({ ...env, DATABASE_URL: allocationDatabaseUrl });
  env.ALLOCATION_TEST_DATABASE_URL = allocationDatabaseUrl;
  await database.createDatabase('waypoint_loader_test');
  const loaderDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_loader_test`;
  await initializeDatabase({ ...env, DATABASE_URL: loaderDatabaseUrl });
  env.LOADER_TEST_DATABASE_URL = loaderDatabaseUrl;
  await database.createDatabase('waypoint_driver_test');
  const driverDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_driver_test`;
  await initializeDatabase({ ...env, DATABASE_URL: driverDatabaseUrl });
  env.DRIVER_TEST_DATABASE_URL = driverDatabaseUrl;
  await database.createDatabase('waypoint_public_judge_test');
  const publicJudgeDatabaseUrl = `postgresql://waypoint_test:${password}@127.0.0.1:${port}/waypoint_public_judge_test`;
  await initializeDatabase({ ...env, DATABASE_URL: publicJudgeDatabaseUrl });
  env.PUBLIC_JUDGE_TEST_DATABASE_URL = publicJudgeDatabaseUrl;
  console.log('Testing against a fresh isolated PostgreSQL database; development data is untouched.');
  await runNode('node_modules/vitest/vitest.mjs', ['run'], env);
} finally { if (started) await database.stop(); }
