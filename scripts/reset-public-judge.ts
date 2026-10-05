import 'dotenv/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { inspectPublicJudgeReset, resetPublicJudgeDemo } from '../apps/api/src/domain/public-judge-reset.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const emptyOrders = args.includes('--empty-orders');
const argument = (name: string) => args.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const expectedDigest = argument('--expected-digest'), manifestPath = argument('--backup-manifest');
if (args.some(value => value !== '--apply' && value !== '--dry-run' && value !== '--empty-orders' && !value.startsWith('--expected-digest=') && !value.startsWith('--backup-manifest='))) throw new Error('Use --dry-run or --apply with --expected-digest and --backup-manifest; starter references also require --empty-orders.');
if (apply && args.includes('--dry-run')) throw new Error('Choose either --dry-run or --apply.');

async function privateFile(path: string) {
  const base = await realpath(resolve('.local')), target = await realpath(resolve(path)), offset = relative(base, target);
  if (!offset || offset.startsWith('..') || isAbsolute(offset) || !(await stat(target)).isFile()) throw new Error('Verified backup files must remain private under .local.');
  return target;
}

async function verifyBackup(databaseName: string, inventoryDigest: string) {
  if (!manifestPath || expectedDigest !== inventoryDigest) throw new Error('Apply requires the exact reviewed inventory digest and a verified private backup manifest.');
  const manifest = JSON.parse(await readFile(await privateFile(manifestPath), 'utf8'));
  if (manifest.version !== 1 || manifest.databaseName !== databaseName || manifest.inventoryDigest !== inventoryDigest
    || manifest.verifiedRestore?.result !== 'PASS' || manifest.verifiedRestore?.inventoryDigest !== inventoryDigest
    || !Number.isFinite(Date.parse(manifest.verifiedRestore?.checkedAt)) || !/^[a-f0-9]{64}$/.test(manifest.archiveSha256)
    || typeof manifest.archivePath !== 'string') throw new Error('Backup identity, inventory or isolated restore evidence did not match.');
  const archive = await privateFile(manifest.archivePath), hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== manifest.archiveSha256) throw new Error('Private backup archive checksum did not match.');
}

const db = new PrismaClient();
try {
  const current = await inspectPublicJudgeReset(db);
  if (!apply) console.log(JSON.stringify({ mode: 'DRY_RUN', emptyOrders, ...current }));
  else {
    await verifyBackup(current.databaseName, current.inventoryDigest);
    const result = await resetPublicJudgeDemo(db, { expectedInventoryDigest: expectedDigest!, emptyOrders });
    console.log(JSON.stringify({ mode: 'APPLY', result: result.result, before: result.before, after: result.after,
      orders: result.orders, emptyOrders, backupVerified: true }));
  }
} catch {
  console.error('Public demo reset stopped. Check the reviewed inventory, public-data guards and verified private backup; no credentials are printed.');
  process.exitCode = 1;
} finally { await db.$disconnect(); }
