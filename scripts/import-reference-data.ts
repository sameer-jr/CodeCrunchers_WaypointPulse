import 'dotenv/config';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PrismaClient, type ReferenceSource } from '@prisma/client';
import { REFERENCE_HEADERS, importReferenceFiles, validateReferenceFiles, type ReferenceFile, type ReferenceFiles } from '../apps/api/src/domain/reference-data.js';

const { values } = parseArgs({ options: { directory: { type: 'string', default: 'private-data/reference' }, source: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
if (!['official', 'synthetic'].includes(values.source ?? '')) throw new Error('Specify --source official or --source synthetic; provenance is never inferred.');
if (values.source === 'synthetic' && process.env.NODE_ENV === 'production') throw new Error('Synthetic reference imports are not allowed in production.');
const directory = await realpath(resolve(values.directory!));
const roots = await Promise.all(['private-data', 'input resources'].map(async folder => {
  try { return await realpath(resolve(folder)); } catch { return null; }
}));
function within(base: string, path: string) {
  const child = relative(base, path);
  return !isAbsolute(child) && child !== '..' && !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}
if (!roots.some(root => root && within(root, directory))) throw new Error('Imports must use an ignored private-data/ or input resources/ directory.');
const files = {} as ReferenceFiles;
for (const name of Object.keys(REFERENCE_HEADERS) as ReferenceFile[]) {
  let path: string;
  try { path = await realpath(resolve(directory, name)); } catch { throw new Error(`Missing required official source: ${name}. Nothing imported.`); }
  if (!within(directory, path)) throw new Error(`${name}: source resolves outside the private import directory.`);
  files[name] = await readFile(path, 'utf8');
}
const validated = validateReferenceFiles(files);
const counts = Object.fromEntries(['outlets', 'vehicles', 'calendar', 'travel', 'allowances'].map(key => [key, validated[key as keyof Pick<typeof validated, 'outlets' | 'vehicles' | 'calendar' | 'travel' | 'allowances'>].length]));
if (values['dry-run']) console.log(JSON.stringify({ validated: true, source: values.source, counts, imported: false }));
else {
  const prisma = new PrismaClient();
  try { console.log(JSON.stringify(await importReferenceFiles(prisma, files, values.source!.toUpperCase() as ReferenceSource))); }
  finally { await prisma.$disconnect(); }
}
