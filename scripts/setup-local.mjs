import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './process.mjs';

const envPath = resolve(root, '.env');
mkdirSync(resolve(root, '.local'), { recursive: true });
if (existsSync(envPath)) {
  console.log('Existing .env preserved. Review .env.example for required settings.');
} else {
  const databasePassword = randomBytes(24).toString('hex');
  const template = readFileSync(resolve(root, '.env.example'), 'utf8')
    .replace('local-only-password', databasePassword)
    .replace('replace-with-a-local-database-password', databasePassword)
    .replace('replace-with-a-random-secret-of-at-least-32-characters', randomBytes(48).toString('hex'));
  writeFileSync(envPath, template, { mode: 0o600, flag: 'wx' });
  console.log('Created ignored .env with generated local database and session secrets.');
}
console.log('Run npm run dev:db in one terminal, then npm run dev in another.');
